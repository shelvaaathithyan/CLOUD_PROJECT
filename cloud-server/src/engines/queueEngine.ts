import { CloudTask, CostMetrics } from '../types';
import { AllocationEngine } from './allocationEngine';
import { resourceManager } from '../resources/resourceManager';
import { SocketService } from '../services/socketService';
import { CostEngine } from './costEngine';
import { WorkerClient } from '../services/workerClient';

export class QueueEngine {
  public static queue: CloudTask[] = [];
  public static runningTasks: CloudTask[] = [];
  public static completedTasks: CloudTask[] = [];
  public static failedTasks: CloudTask[] = [];
  public static allTasks: CloudTask[] = []; // To serve /cloud/tasks

  public static ensureTaskCost(task: CloudTask): void {
    if (task.estimatedCostUsd === undefined || task.cpuCostUsd === undefined) {
      const breakdown = CostEngine.getCostBreakdown(task);
      task.estimatedCostUsd = breakdown.total;
      task.cpuCostUsd = breakdown.cpuCost;
      task.ramCostUsd = breakdown.ramCost;
      task.storageCostUsd = breakdown.storageCost;
      task.costBreakdown = breakdown;
      task.costPenalty = CostEngine.calculateCostPenalty(task.estimatedCostUsd);
      task.effectiveScore = CostEngine.calculateEffectiveScore(
        task.priorityScore,
        task.waitingTimeBonus || 0,
        task.estimatedCostUsd
      );
      const penaltyStr = (task.costPenalty ?? 0) > 0 ? `-${task.costPenalty?.toFixed(2)}` : '0.00';
      task.schedulingExplanation = `Base Priority: ${task.priorityScore}, Cost Penalty: ${penaltyStr} pts, Effective Score: ${task.effectiveScore.toFixed(2)} (Est. Cost: $${task.estimatedCostUsd.toFixed(6)})`;
    }
  }

  public static addTaskToQueue(task: CloudTask, reason: string) {
    task.status = 'WAITING';
    task.waitReason = reason;

    this.ensureTaskCost(task);

    this.queue.push(task);
    if (!this.allTasks.find(t => t.requestId === task.requestId)) {
      this.allTasks.push(task);
    }
    this.sortQueue();
    SocketService.emit('QUEUE_UPDATED', this.getQueueStats());
  }

  public static sortQueue() {
    this.queue.sort((a, b) => {
      const penaltyA = a.costPenalty ?? CostEngine.calculateCostPenalty(a.estimatedCostUsd ?? 0);
      const penaltyB = b.costPenalty ?? CostEngine.calculateCostPenalty(b.estimatedCostUsd ?? 0);
      const effA = a.priorityScore + a.waitingTimeBonus - penaltyA;
      const effB = b.priorityScore + b.waitingTimeBonus - penaltyB;

      a.effectiveScore = Number(effA.toFixed(4));
      b.effectiveScore = Number(effB.toFixed(4));

      // Higher effective score gets scheduled first
      if (Math.abs(effA - effB) > 0.00001) {
        return effB - effA;
      }
      // Deterministic FIFO tie-breaker: earlier creation scheduled first
      return a.createdAt - b.createdAt;
    });
  }

  public static updateAging() {
    let changed = false;
    const now = Date.now();
    for (const task of this.queue) {
      const waitTimeSeconds = Math.floor((now - task.createdAt) / 1000);
      const bonus = Math.floor(waitTimeSeconds / 5);
      if (task.waitingTimeBonus !== bonus) {
        task.waitingTimeBonus = bonus;
        const penalty = task.costPenalty ?? CostEngine.calculateCostPenalty(task.estimatedCostUsd ?? 0);
        task.effectiveScore = Number((task.priorityScore + bonus - penalty).toFixed(4));
        changed = true;
      }
    }
    if (changed) {
      this.sortQueue();
      SocketService.emit('QUEUE_UPDATED', this.getQueueStats());
    }
  }

  public static processQueue() {
    if (this.queue.length === 0) return;

    let allocatedAny = false;
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      const suitability = AllocationEngine.calculateSuitability(task);
      
      if (suitability.suitable) {
        const allocated = AllocationEngine.allocateTask(task);
        if (allocated) {
          this.queue.splice(i, 1);
          i--;
          this.startTask(task);
          allocatedAny = true;
        }
      } else {
        task.waitReason = suitability.reason;
      }
    }
    if (allocatedAny) {
      SocketService.emit('QUEUE_UPDATED', this.getQueueStats());
    }
  }

  /**
   * Sends a task to its worker node. Replaceable so tests can run without workers.
   */
  public static dispatcher: (task: CloudTask) => Promise<void> = async (task) => {
    const node = resourceManager.getNode(task.nodeId!);
    if (!node) throw new Error(`Unknown node ${task.nodeId}`);
    await WorkerClient.runTask(node.url, {
      taskId: task.requestId,
      cpuUnits: task.cpuRequired,
      ramMb: task.ramRequired,
      storageMb: task.storageRequired,
      durationSec: task.estimatedExecutionTime,
    });
  };

  public static startTask(task: CloudTask) {
    this.ensureTaskCost(task);
    task.status = 'RUNNING';
    task.startedAt = Date.now();
    task.nodeId = task.allocations?.nodeId;
    this.runningTasks.push(task);
    if (!this.allTasks.find(t => t.requestId === task.requestId)) {
      this.allTasks.push(task);
    }
    
    SocketService.emit('TASK_STARTED', task);
    SocketService.emit('RESOURCE_UPDATED', resourceManager.getState());

    // The task completes when the worker reports back (POST /cloud/nodes/:nodeId/tasks/:taskId/complete).
    this.dispatcher(task).catch(err => this.handleDispatchFailure(task, err));
  }

  private static handleDispatchFailure(task: CloudTask, err: Error) {
    // Ignore if the task already finished or was failed by another path.
    if (task.status !== 'RUNNING' || !this.runningTasks.includes(task)) return;
    console.error(`Dispatch of ${task.requestId} to ${task.nodeId} failed:`, err.message);

    resourceManager.release(task.requestId);
    this.runningTasks = this.runningTasks.filter(t => t.requestId !== task.requestId);
    task.startedAt = undefined;
    task.nodeId = undefined;
    task.allocations = undefined;
    SocketService.emit('RESOURCE_UPDATED', resourceManager.getState());
    this.addTaskToQueue(task, `Dispatch failed: ${err.message}`);
  }

  public static completeTask(task: CloudTask, outcome: 'COMPLETED' | 'FAILED' = 'COMPLETED', failureReason?: string) {
    if (!this.runningTasks.includes(task)) return;
    this.ensureTaskCost(task);
    const released = resourceManager.release(task.requestId);
    task.completedAt = Date.now();
    if (outcome === 'COMPLETED' && released) {
      task.status = 'COMPLETED';
      this.completedTasks.push(task);
      SocketService.emit('TASK_COMPLETED', task);
    } else {
      task.status = 'FAILED';
      task.failureReason = failureReason ?? (released ? undefined : 'Allocation not found on release');
      this.failedTasks.push(task);
      SocketService.emit('TASK_FAILED', task);
    }
    
    this.runningTasks = this.runningTasks.filter(t => t.requestId !== task.requestId);
    SocketService.emit('RESOURCE_UPDATED', resourceManager.getState());
    
    this.processQueue();
  }

  public static findRunningTask(taskId: string): CloudTask | undefined {
    return this.runningTasks.find(t => t.requestId === taskId);
  }

  /** Fails every task running on a node (e.g. the node went offline). */
  public static failTasksOnNode(nodeId: string, reason: string) {
    for (const task of this.runningTasks.filter(t => t.nodeId === nodeId)) {
      this.completeTask(task, 'FAILED', reason);
    }
  }

  public static getQueueStats() {
    this.queue.forEach(t => this.ensureTaskCost(t));
    return {
      length: this.queue.length,
      highPriority: this.queue.filter(t => t.priority === 'HIGH').length,
      mediumPriority: this.queue.filter(t => t.priority === 'MEDIUM').length,
      lowPriority: this.queue.filter(t => t.priority === 'LOW').length,
      queue: this.queue,
    };
  }

  public static getAllTasks() {
    this.allTasks.forEach(t => this.ensureTaskCost(t));
    return this.allTasks;
  }

  public static getCostMetrics(): CostMetrics {
    const totalSubmittedCost = this.allTasks.reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0);
    const totalCompletedCost = this.completedTasks.reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0);
    const completedCount = this.completedTasks.length;
    const avgCompletedCost = completedCount > 0 ? totalCompletedCost / completedCount : 0;

    const costByType = {
      CPU: this.allTasks.filter(t => t.taskType === 'CPU').reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0),
      MEMORY: this.allTasks.filter(t => t.taskType === 'MEMORY').reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0),
      MIXED: this.allTasks.filter(t => t.taskType === 'MIXED').reduce((sum, t) => sum + (t.estimatedCostUsd ?? 0), 0),
    };

    return {
      totalEstimatedSubmittedCost: Number(totalSubmittedCost.toFixed(6)),
      totalEstimatedCompletedCost: Number(totalCompletedCost.toFixed(6)),
      averageCostPerCompletedTask: Number(avgCompletedCost.toFixed(6)),
      costByType: {
        CPU: Number(costByType.CPU.toFixed(6)),
        MEMORY: Number(costByType.MEMORY.toFixed(6)),
        MIXED: Number(costByType.MIXED.toFixed(6)),
      },
      submittedCount: this.allTasks.length,
      completedCount,
      currency: 'USD',
      isSimulation: true,
    };
  }

  public static reset() {
    this.queue = [];
    this.runningTasks = [];
    this.completedTasks = [];
    this.failedTasks = [];
    this.allTasks = [];
  }
}

// Start aging interval (unref'd so it doesn't keep test processes alive)
setInterval(() => {
  QueueEngine.updateAging();
}, 1000).unref();
