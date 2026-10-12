import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

export interface TaskSpec {
  taskId: string;
  cpuUnits: number;   // 100 units = 1 full core
  ramMb: number;
  storageMb: number;
  durationSec: number;
}

export interface TaskResult {
  taskId: string;
  status: 'COMPLETED' | 'FAILED';
  actualDurationMs: number;
  error?: string;
}

interface RunningTask {
  spec: TaskSpec;
  startedAt: number;
  threads: Worker[];
  memory: Buffer | null;
  filePath: string | null;
}

/**
 * Busy-loop executed in a worker thread. Each 100ms slice it spins for
 * `share` of the slice and sleeps for the rest, so one thread uses
 * `share` of a core (e.g. 0.5 → 50% of one core).
 */
const CPU_BURN_SCRIPT = `
const { workerData } = require('worker_threads');
const SLICE_MS = 100;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
while (Date.now() < workerData.endAt) {
  const busyUntil = Date.now() + SLICE_MS * workerData.share;
  while (Date.now() < busyUntil) {}
  const idleMs = SLICE_MS * (1 - workerData.share);
  if (idleMs > 0) Atomics.wait(sleeper, 0, 0, idleMs);
}
`;

const WRITE_CHUNK = Buffer.alloc(4 * 1024 * 1024, 7);

export class TaskRunner {
  private running = new Map<string, RunningTask>();

  constructor(private dataDir: string, private onFinish: (result: TaskResult) => void) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  public runningTaskIds(): string[] {
    return [...this.running.keys()];
  }

  public storageUsedMb(): number {
    let total = 0;
    for (const task of this.running.values()) total += task.spec.storageMb;
    return total;
  }

  public start(spec: TaskSpec): void {
    if (this.running.has(spec.taskId)) {
      throw new Error(`Task ${spec.taskId} is already running`);
    }

    const startedAt = Date.now();
    const task: RunningTask = { spec, startedAt, threads: [], memory: null, filePath: null };
    this.running.set(spec.taskId, task);

    try {
      // RAM: allocate and fill the buffer so the pages are really committed.
      if (spec.ramMb > 0) {
        task.memory = Buffer.alloc(Math.round(spec.ramMb * 1024 * 1024), 1);
      }

      // CPU: spread the load over enough threads that each one needs ≤ 1 core.
      if (spec.cpuUnits > 0) {
        const threadCount = Math.ceil(spec.cpuUnits / 100);
        const share = spec.cpuUnits / threadCount / 100;
        const endAt = startedAt + spec.durationSec * 1000;
        for (let i = 0; i < threadCount; i++) {
          task.threads.push(new Worker(CPU_BURN_SCRIPT, { eval: true, workerData: { share, endAt } }));
        }
      }
    } catch (err) {
      this.finish(spec.taskId, 'FAILED', (err as Error).message);
      return;
    }

    // Storage: write a real file of the requested size (runs alongside the CPU load).
    if (spec.storageMb > 0) {
      task.filePath = path.join(this.dataDir, `${spec.taskId}.bin`);
      this.writeFile(task.filePath, spec.storageMb).catch(err => {
        this.finish(spec.taskId, 'FAILED', `Storage write failed: ${err.message}`);
      });
    }

    setTimeout(() => this.finish(spec.taskId, 'COMPLETED'), spec.durationSec * 1000);
  }

  private async writeFile(filePath: string, sizeMb: number): Promise<void> {
    const handle = await fs.promises.open(filePath, 'w');
    try {
      let remaining = Math.round(sizeMb * 1024 * 1024);
      while (remaining > 0) {
        const bytes = Math.min(remaining, WRITE_CHUNK.length);
        await handle.write(WRITE_CHUNK, 0, bytes);
        remaining -= bytes;
      }
    } finally {
      await handle.close();
    }
  }

  private finish(taskId: string, status: TaskResult['status'], error?: string): void {
    const task = this.running.get(taskId);
    if (!task) return;
    this.running.delete(taskId);

    task.threads.forEach(t => t.terminate());
    task.memory = null;
    // Return the task's RAM to the OS right away instead of whenever V8 next collects
    // (needs node --expose-gc, set in the Dockerfile; a no-op otherwise).
    (global as { gc?: () => void }).gc?.();
    if (task.filePath) {
      fs.promises.rm(task.filePath, { force: true }).catch(() => {});
    }

    this.onFinish({ taskId, status, actualDurationMs: Date.now() - task.startedAt, error });
  }
}
