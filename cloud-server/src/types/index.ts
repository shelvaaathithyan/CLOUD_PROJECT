export interface NodeResources {
  cpu: number;       // CPU units (100 = 1 core)
  ramMb: number;
  storageMb: number;
}

/** Real usage measured by the worker itself (cgroup stats inside Docker). */
export interface NodeUsage {
  cpuPercent: number;     // % of the node's CPU limit
  memoryUsedMb: number;
  memoryLimitMb: number;
  storageUsedMb: number;
  source: 'cgroup' | 'process';
}

export interface WorkerNode {
  id: string;
  url: string;
  status: 'ONLINE' | 'OFFLINE';
  capacity: NodeResources;
  allocated: NodeResources;   // reserved by the scheduler for running tasks
  usage: NodeUsage | null;    // last measured usage, null until first report
  tasks: string[];
  lastSeen: number | null;
}

export interface InfrastructureState {
  nodes: WorkerNode[];
  // Cluster totals across ONLINE nodes
  cpu: { total: number; allocated: number };       // CPU units
  ram: { total: number; allocated: number };       // MB
  storage: { total: number; allocated: number };   // MB
}

export interface AllocationRequest {
  taskId: string;
  cpuRequired: number; // CPU units (100 = 1 core)
  ramRequired: number; // MB
  storageRequired: number; // MB
}

export interface TaskAllocation {
  taskId: string;
  nodeId: string;
  cpu: number;
  ramMb: number;
  storageMb: number;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskStatus = 'WAITING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type TaskType = 'CPU' | 'MEMORY' | 'MIXED';

export interface TaskCostBreakdown {
  cpuCost: number;
  ramCost: number;
  storageCost: number;
  cpuCostUsd?: number;
  ramCostUsd?: number;
  storageCostUsd?: number;
  total: number;
}

export interface CostMetrics {
  totalEstimatedSubmittedCost: number;
  totalEstimatedCompletedCost: number;
  averageCostPerCompletedTask: number;
  costByType: Record<TaskType, number>;
  submittedCount: number;
  completedCount: number;
  currency: string;
  isSimulation: boolean;
}

export interface CloudTask {
  requestId: string;
  taskName: string;
  taskType: TaskType;
  priority: TaskPriority;
  priorityScore: number;
  suitabilityScore: number;
  cpuRequired: number; // CPU units (100 = 1 core)
  ramRequired: number; // MB
  storageRequired: number; // MB
  estimatedExecutionTime: number; // in seconds
  urgency: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: TaskStatus;
  waitingTimeBonus: number;
  waitReason?: string;
  allocations?: TaskAllocation;
  nodeId?: string;
  actualDurationMs?: number;
  failureReason?: string;
  estimatedCostUsd?: number;
  cpuCostUsd?: number;
  ramCostUsd?: number;
  storageCostUsd?: number;
  costBreakdown?: TaskCostBreakdown;
  costPenalty?: number;
  effectiveScore?: number;
  schedulingExplanation?: string;
}
