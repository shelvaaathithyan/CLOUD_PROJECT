import { resourceManager } from '../resources/resourceManager';
import { QueueEngine } from '../engines/queueEngine';
import { SocketService } from './socketService';
import { WorkerClient } from './workerClient';

const DEFAULT_WORKER_URLS = 'http://localhost:7001,http://localhost:7002,http://localhost:7003';
const POLL_INTERVAL_MS = 2000;
const FAILURES_BEFORE_OFFLINE = 2;
// Grace period before a task the worker no longer reports is treated as lost.
const LOST_TASK_GRACE_MS = 15000;

/**
 * Discovers worker nodes, polls their measured usage, and detects failures.
 * Worker URLs come from WORKER_URLS (comma-separated).
 */
export class NodeMonitor {
  private static urls: string[] = [];
  private static urlToNodeId = new Map<string, string>();
  private static failures = new Map<string, number>();
  private static timer: NodeJS.Timeout | null = null;

  public static start(): void {
    this.urls = (process.env.WORKER_URLS || DEFAULT_WORKER_URLS)
      .split(',')
      .map(u => u.trim().replace(/\/$/, ''))
      .filter(Boolean);
    console.log(`Monitoring worker nodes: ${this.urls.join(', ')}`);

    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  public static stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private static async poll(): Promise<void> {
    const results = await Promise.all(this.urls.map(url => this.pollNode(url)));
    if (results.some(cameOnline => cameOnline)) {
      QueueEngine.processQueue();
    }
    SocketService.emit('RESOURCE_UPDATED', resourceManager.getState());
  }

  /** Returns true if the node just came (back) online. */
  private static async pollNode(url: string): Promise<boolean> {
    let nodeId = this.urlToNodeId.get(url);
    try {
      if (!nodeId) {
        const info = await WorkerClient.getInfo(url);
        nodeId = info.nodeId;
        resourceManager.registerNode(nodeId, url, info.capacity);
        this.urlToNodeId.set(url, nodeId);
      }

      const metrics = await WorkerClient.getMetrics(url);
      const wasOnline = resourceManager.getNode(nodeId)?.status === 'ONLINE';
      resourceManager.markOnline(nodeId, {
        cpuPercent: metrics.cpuPercent,
        memoryUsedMb: metrics.memoryUsedMb,
        memoryLimitMb: metrics.memoryLimitMb,
        storageUsedMb: metrics.storageUsedMb,
        source: metrics.source,
      });
      this.failures.set(url, 0);
      this.failLostTasks(nodeId, metrics.runningTasks);

      if (!wasOnline) console.log(`Worker ${nodeId} is ONLINE (${url})`);
      return !wasOnline;
    } catch {
      const count = (this.failures.get(url) ?? 0) + 1;
      this.failures.set(url, count);
      const node = nodeId ? resourceManager.getNode(nodeId) : undefined;
      if (node && node.status === 'ONLINE' && count >= FAILURES_BEFORE_OFFLINE) {
        console.warn(`Worker ${node.id} is OFFLINE (${url})`);
        resourceManager.markOffline(node.id);
        QueueEngine.failTasksOnNode(node.id, `Worker ${node.id} went offline`);
      }
      return false;
    }
  }

  /** Fails tasks the scheduler thinks are running on a node that no longer reports them (e.g. worker restarted). */
  private static failLostTasks(nodeId: string, reportedTaskIds: string[]): void {
    const reported = new Set(reportedTaskIds);
    const now = Date.now();
    for (const task of QueueEngine.runningTasks) {
      if (task.nodeId !== nodeId || reported.has(task.requestId)) continue;
      const expectedEnd = (task.startedAt ?? now) + task.estimatedExecutionTime * 1000;
      if (now > expectedEnd + LOST_TASK_GRACE_MS) {
        QueueEngine.completeTask(task, 'FAILED', `Task no longer running on ${nodeId}`);
      }
    }
  }
}
