import { NodeResources, NodeUsage } from '../types';

const REQUEST_TIMEOUT_MS = 2000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}${body ? `: ${body}` : ''}`);
  }
  return res.json() as Promise<T>;
}

/** HTTP client for the worker node agents (see /worker). */
export class WorkerClient {
  public static getInfo(url: string) {
    return request<{ nodeId: string; capacity: NodeResources }>(`${url}/info`);
  }

  public static getMetrics(url: string) {
    return request<NodeUsage & { nodeId: string; runningTasks: string[] }>(`${url}/metrics`);
  }

  public static runTask(url: string, spec: { taskId: string; cpuUnits: number; ramMb: number; storageMb: number; durationSec: number }) {
    return request<{ accepted: boolean; nodeId: string }>(`${url}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });
  }
}
