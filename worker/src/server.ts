import express from 'express';
import os from 'os';
import path from 'path';
import { TaskRunner, TaskResult, TaskSpec } from './taskRunner';
import { UsageSampler } from './metrics';

const NODE_ID = process.env.NODE_ID || 'worker-local';
const PORT = Number(process.env.PORT) || 7001;
const SCHEDULER_URL = process.env.SCHEDULER_URL || 'http://localhost:5050';
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), `smartcloud-${NODE_ID}`);

// Schedulable capacity this node advertises to the scheduler.
const capacity = {
  cpu: Number(process.env.CPU_UNITS) || 100,          // 100 units = 1 core
  ramMb: Number(process.env.RAM_MB) || 512,
  storageMb: Number(process.env.STORAGE_MB) || 1024,
};

const sampler = new UsageSampler(capacity.cpu / 100, capacity.ramMb);
setInterval(() => sampler.sample(), 1000);

async function reportCompletion(result: TaskResult, attempt = 1): Promise<void> {
  try {
    const res = await fetch(`${SCHEDULER_URL}/cloud/nodes/${NODE_ID}/tasks/${result.taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt < 5) {
      setTimeout(() => reportCompletion(result, attempt + 1), attempt * 1000);
    } else {
      console.error(`[${NODE_ID}] Could not report completion of ${result.taskId}:`, (err as Error).message);
    }
  }
}

const runner = new TaskRunner(DATA_DIR, result => {
  console.log(`[${NODE_ID}] ${result.status} ${result.taskId} in ${result.actualDurationMs}ms${result.error ? ` (${result.error})` : ''}`);
  reportCompletion(result);
});

const app = express();
app.use(express.json());

app.get('/info', (req, res) => {
  res.json({ nodeId: NODE_ID, capacity });
});

app.get('/metrics', (req, res) => {
  res.json({
    nodeId: NODE_ID,
    ...sampler.current(),
    storageUsedMb: runner.storageUsedMb(),
    runningTasks: runner.runningTaskIds(),
  });
});

app.post('/tasks', (req, res) => {
  const { taskId, cpuUnits, ramMb, storageMb, durationSec } = req.body ?? {};
  const spec: TaskSpec = {
    taskId,
    cpuUnits: Number(cpuUnits ?? 0),
    ramMb: Number(ramMb ?? 0),
    storageMb: Number(storageMb ?? 0),
    durationSec: Number(durationSec ?? 10),
  };

  if (typeof taskId !== 'string' || !taskId) {
    res.status(400).json({ error: 'taskId is required' });
    return;
  }
  const numbers = [spec.cpuUnits, spec.ramMb, spec.storageMb, spec.durationSec];
  if (numbers.some(n => !Number.isFinite(n) || n < 0) || spec.durationSec <= 0) {
    res.status(400).json({ error: 'cpuUnits, ramMb, storageMb must be ≥ 0 and durationSec > 0' });
    return;
  }

  try {
    runner.start(spec);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }
  console.log(`[${NODE_ID}] START ${taskId}: ${spec.cpuUnits} CPU units, ${spec.ramMb} MB RAM, ${spec.storageMb} MB disk, ${spec.durationSec}s`);
  res.status(202).json({ accepted: true, nodeId: NODE_ID });
});

app.listen(PORT, () => {
  console.log(`Worker ${NODE_ID} listening on port ${PORT} (capacity: ${JSON.stringify(capacity)}, scheduler: ${SCHEDULER_URL})`);
});
