import { InfrastructureState, AllocationRequest, TaskAllocation, WorkerNode, NodeResources, NodeUsage } from '../types';

const emptyResources = (): NodeResources => ({ cpu: 0, ramMb: 0, storageMb: 0 });

/**
 * Tracks the worker nodes and what the scheduler has reserved on each.
 *
 * Placement uses reserved capacity (like Kubernetes resource requests), while
 * `usage` holds the real CPU/RAM each worker measures and reports.
 */
export class ResourceManager {
  private nodes: WorkerNode[] = [];
  private activeAllocations: Map<string, TaskAllocation> = new Map();

  public registerNode(id: string, url: string, capacity: NodeResources): WorkerNode {
    const existing = this.nodes.find(n => n.id === id);
    if (existing) {
      existing.url = url;
      existing.capacity = { ...capacity };
      return existing;
    }
    const node: WorkerNode = {
      id,
      url,
      status: 'OFFLINE',
      capacity: { ...capacity },
      allocated: emptyResources(),
      usage: null,
      tasks: [],
      lastSeen: null,
    };
    this.nodes.push(node);
    return node;
  }

  public getNode(id: string): WorkerNode | undefined {
    return this.nodes.find(n => n.id === id);
  }

  public markOnline(id: string, usage: NodeUsage | null): void {
    const node = this.getNode(id);
    if (!node) return;
    node.status = 'ONLINE';
    node.usage = usage;
    node.lastSeen = Date.now();
  }

  public markOffline(id: string): void {
    const node = this.getNode(id);
    if (!node) return;
    node.status = 'OFFLINE';
    node.usage = null;
  }

  public getState(): InfrastructureState {
    const online = this.nodes.filter(n => n.status === 'ONLINE');
    const sum = (pick: (n: WorkerNode) => number) => online.reduce((s, n) => s + pick(n), 0);
    return {
      nodes: this.nodes,
      cpu: { total: sum(n => n.capacity.cpu), allocated: sum(n => n.allocated.cpu) },
      ram: { total: sum(n => n.capacity.ramMb), allocated: sum(n => n.allocated.ramMb) },
      storage: { total: sum(n => n.capacity.storageMb), allocated: sum(n => n.allocated.storageMb) },
    };
  }

  /** Free capacity on each ONLINE node. */
  public getNodeAvailability(): Array<{ node: WorkerNode; free: NodeResources }> {
    return this.nodes
      .filter(n => n.status === 'ONLINE')
      .map(node => ({
        node,
        free: {
          cpu: node.capacity.cpu - node.allocated.cpu,
          ramMb: node.capacity.ramMb - node.allocated.ramMb,
          storageMb: node.capacity.storageMb - node.allocated.storageMb,
        },
      }));
  }

  /** Cluster-wide free capacity across ONLINE nodes. */
  public getAvailableResources() {
    const availability = this.getNodeAvailability();
    return {
      cpuAvailable: availability.reduce((s, a) => s + a.free.cpu, 0),
      ramAvailable: availability.reduce((s, a) => s + a.free.ramMb, 0),
      storageAvailable: availability.reduce((s, a) => s + a.free.storageMb, 0),
    };
  }

  /**
   * Picks the node for a request: among nodes that fit, the one left with the
   * most free CPU (spreads load so every worker shares the work).
   */
  public findNodeFor(req: Omit<AllocationRequest, 'taskId'>): WorkerNode | null {
    let best: { node: WorkerNode; cpuLeftRatio: number } | null = null;
    for (const { node, free } of this.getNodeAvailability()) {
      if (free.cpu < req.cpuRequired || free.ramMb < req.ramRequired || free.storageMb < req.storageRequired) continue;
      const cpuLeftRatio = (free.cpu - req.cpuRequired) / node.capacity.cpu;
      if (!best || cpuLeftRatio > best.cpuLeftRatio) best = { node, cpuLeftRatio };
    }
    return best?.node ?? null;
  }

  public allocate(req: AllocationRequest): TaskAllocation | null {
    const node = this.findNodeFor(req);
    if (!node) return null;

    node.allocated.cpu += req.cpuRequired;
    node.allocated.ramMb += req.ramRequired;
    node.allocated.storageMb += req.storageRequired;
    node.tasks.push(req.taskId);

    const allocation: TaskAllocation = {
      taskId: req.taskId,
      nodeId: node.id,
      cpu: req.cpuRequired,
      ramMb: req.ramRequired,
      storageMb: req.storageRequired,
    };
    this.activeAllocations.set(req.taskId, allocation);
    return allocation;
  }

  public release(taskId: string): boolean {
    const alloc = this.activeAllocations.get(taskId);
    if (!alloc) return false;

    const node = this.getNode(alloc.nodeId);
    if (node) {
      node.allocated.cpu -= alloc.cpu;
      node.allocated.ramMb -= alloc.ramMb;
      node.allocated.storageMb -= alloc.storageMb;
      node.tasks = node.tasks.filter(id => id !== taskId);
    }
    this.activeAllocations.delete(taskId);
    return true;
  }

  /** Reserved (scheduled) and measured (real) utilization percentages across ONLINE nodes. */
  public getUtilization() {
    const state = this.getState();
    const online = state.nodes.filter(n => n.status === 'ONLINE');
    const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

    // Measured CPU: weight each node's % by its core count.
    const measuredCpuUnits = online.reduce((s, n) => s + ((n.usage?.cpuPercent ?? 0) / 100) * n.capacity.cpu, 0);
    const measuredRamMb = online.reduce((s, n) => s + (n.usage?.memoryUsedMb ?? 0), 0);
    const ramLimitMb = online.reduce((s, n) => s + (n.usage?.memoryLimitMb ?? n.capacity.ramMb), 0);

    return {
      cpu: pct(state.cpu.allocated, state.cpu.total),
      ram: pct(state.ram.allocated, state.ram.total),
      storage: pct(state.storage.allocated, state.storage.total),
      measuredCpu: pct(measuredCpuUnits, state.cpu.total),
      measuredRam: pct(measuredRamMb, ramLimitMb),
      nodesOnline: online.length,
      nodesTotal: state.nodes.length,
    };
  }
}

export const resourceManager = new ResourceManager();
