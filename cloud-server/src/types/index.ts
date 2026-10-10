export interface ResourceUnit {
  id: string;
  type: 'CPU' | 'GPU';
  capacity: number; // e.0. 100 (%)
  allocated: number; // 0 to 100
  tasks: Array<{ taskId: string; allocation: number }>;
  status: 'IDLE' | 'ACTIVE';
}

export interface InfrastructureState {
  cpu: ResourceUnit[];
  gpu: ResourceUnit[];
  ram: { total: number; allocated: number }; // GB
  storage: { total: number; allocated: number }; // GB
}

export interface AllocationRequest {
  taskId: string;
  cpuRequired: number; // percentage (0-100)
  gpuRequired: number; // percentage (0-100)
  ramRequired: number; // GB
  storageRequired: number; // GB
}

export interface TaskAllocation {
  taskId: string;
  cpuAllocations: Array<{ id: string; amount: number }>;
  gpuAllocations: Array<{ id: string; amount: number }>;
  ramAllocated: number;
  storageAllocated: number;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskStatus = 'WAITING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface TaskCostBreakdown {
  cpuCost: number;
  gpuCost: number;
  ramCost: number;
  storageCost: number;
  cpuCostUsd?: number;
  gpuCostUsd?: number;
  ramCostUsd?: number;
  storageCostUsd?: number;
  total: number;
}

export interface CostMetrics {
  totalEstimatedSubmittedCost: number;
  totalEstimatedCompletedCost: number;
  averageCostPerCompletedTask: number;
  costByType: {
    CPU: number;
    GPU: number;
    MIXED: number;
  };
  submittedCount: number;
  completedCount: number;
  currency: string;
  isSimulation: boolean;
}

export interface CloudTask {
  requestId: string;
  taskName: string;
  taskType: 'CPU' | 'GPU' | 'MIXED';
  priority: TaskPriority;
  priorityScore: number;
  suitabilityScore: number;
  cpuRequired: number;
  gpuRequired: number;
  ramRequired: number;
  storageRequired: number;
  estimatedExecutionTime: number; // in seconds
  urgency: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: TaskStatus;
  waitingTimeBonus: number;
  waitReason?: string;
  allocations?: any;
  estimatedCostUsd?: number;
  cpuCostUsd?: number;
  gpuCostUsd?: number;
  ramCostUsd?: number;
  storageCostUsd?: number;
  costBreakdown?: TaskCostBreakdown;
  costPenalty?: number;
  effectiveScore?: number;
  schedulingExplanation?: string;
}
