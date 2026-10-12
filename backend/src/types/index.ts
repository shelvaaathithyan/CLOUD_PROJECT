export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskStatus = 'WAITING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface CloudTask {
  requestId: string;
  taskName: string;
  taskType: 'CPU' | 'MEMORY' | 'MIXED';
  priority: TaskPriority;
  priorityScore: number;
  suitabilityScore: number;
  cpuRequired: number; // CPU units (100 = 1 core)
  ramRequired: number; // MB
  storageRequired: number; // MB
  estimatedExecutionTime: number; // in seconds or milliseconds
  urgency: number; // 0-100
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: TaskStatus;
  waitingTimeBonus: number;
  waitReason?: string;
  allocations?: any; // To store resource IDs assigned
  nodeId?: string; // Worker node running the task
  estimatedCostUsd?: number;
  cpuCostUsd?: number;
  ramCostUsd?: number;
  storageCostUsd?: number;
  costBreakdown?: {
    cpuCost: number;
    ramCost: number;
    storageCost: number;
    cpuCostUsd?: number;
    ramCostUsd?: number;
    storageCostUsd?: number;
    total: number;
  };
  costPenalty?: number;
  effectiveScore?: number;
  schedulingExplanation?: string;
}

export interface ResourceState {
  cpuAvailable: number;
  ramAvailable: number;
  storageAvailable: number;
}
