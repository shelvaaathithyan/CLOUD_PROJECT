import fs from 'fs';

/**
 * Measures the real resource usage of this worker.
 *
 * Inside Docker it reads the container's cgroup v2 files, so the numbers match
 * what `docker stats` shows. When run directly with Node (no container), it
 * falls back to this process's own CPU and memory usage.
 */

const CGROUP_DIR = '/sys/fs/cgroup';

function readFile(name: string): string | null {
  try {
    return fs.readFileSync(`${CGROUP_DIR}/${name}`, 'utf8').trim();
  } catch {
    return null;
  }
}

function readStatField(name: string, field: string): number | null {
  const content = readFile(name);
  if (!content) return null;
  const line = content.split('\n').find(l => l.startsWith(`${field} `));
  return line ? Number(line.split(' ')[1]) : null;
}

/** Total CPU time consumed, in microseconds. */
function cpuUsageUsec(): number {
  const cgroupUsec = readStatField('cpu.stat', 'usage_usec');
  if (cgroupUsec !== null) return cgroupUsec;
  const { user, system } = process.cpuUsage();
  return user + system;
}

/** CPU limit in cores from `cpu.max` ("<quota> <period>" or "max <period>"). */
function cgroupCpuLimitCores(): number | null {
  const content = readFile('cpu.max');
  if (!content) return null;
  const [quota, period] = content.split(' ');
  if (quota === 'max') return null;
  return Number(quota) / Number(period);
}

function memoryUsedBytes(): number {
  // `anon` excludes page cache, so writing storage files doesn't inflate RAM usage.
  const anon = readStatField('memory.stat', 'anon');
  if (anon !== null) return anon;
  return process.memoryUsage().rss;
}

function cgroupMemoryLimitBytes(): number | null {
  const content = readFile('memory.max');
  if (!content || content === 'max') return null;
  return Number(content);
}

export interface MeasuredUsage {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  source: 'cgroup' | 'process';
}

export class UsageSampler {
  private lastUsec = cpuUsageUsec();
  private lastTime = process.hrtime.bigint();
  private latestCpuPercent = 0;

  constructor(private fallbackCpuCores: number, private fallbackMemoryMb: number) {}

  /** Call periodically; CPU% is computed over the interval since the previous sample. */
  public sample(): void {
    const nowUsec = cpuUsageUsec();
    const nowTime = process.hrtime.bigint();
    const elapsedUsec = Number(nowTime - this.lastTime) / 1000;
    const cores = cgroupCpuLimitCores() ?? this.fallbackCpuCores;

    if (elapsedUsec > 0) {
      const percent = ((nowUsec - this.lastUsec) / (elapsedUsec * cores)) * 100;
      this.latestCpuPercent = Math.min(Math.max(percent, 0), 100);
    }
    this.lastUsec = nowUsec;
    this.lastTime = nowTime;
  }

  public current(): MeasuredUsage {
    const limitBytes = cgroupMemoryLimitBytes();
    return {
      cpuPercent: Number(this.latestCpuPercent.toFixed(1)),
      memoryUsedMb: Math.round(memoryUsedBytes() / (1024 * 1024)),
      memoryLimitMb: limitBytes !== null ? Math.round(limitBytes / (1024 * 1024)) : this.fallbackMemoryMb,
      source: fs.existsSync(`${CGROUP_DIR}/cpu.stat`) ? 'cgroup' : 'process',
    };
  }
}
