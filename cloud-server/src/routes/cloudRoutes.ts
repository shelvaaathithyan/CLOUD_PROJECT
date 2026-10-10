import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PriorityEngine } from '../engines/priorityEngine';
import { AllocationEngine } from '../engines/allocationEngine';
import { QueueEngine } from '../engines/queueEngine';
import { CostEngine } from '../engines/costEngine';
import { CloudTask } from '../types';
import { resourceManager } from '../resources/resourceManager';

const router = Router();

router.post('/request', (req, res) => {
  const taskReq = req.body;

  // 1. Validate inputs at request boundary
  const validation = CostEngine.validateTaskInputs(taskReq);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  // 2. Calculate priority score
  const score = PriorityEngine.calculatePriorityScore(taskReq);

  // 3. Estimate cost and breakdown
  const costBreakdown = CostEngine.getCostBreakdown(taskReq);
  const estimatedCostUsd = costBreakdown.total;
  const costPenalty = CostEngine.calculateCostPenalty(estimatedCostUsd);
  const effectiveScore = CostEngine.calculateEffectiveScore(score, 0, estimatedCostUsd);

  // 4. Construct CloudTask with proper nullish coalescing for numeric fields
  const task: CloudTask = {
    requestId: `REQ-${uuidv4().substring(0, 6).toUpperCase()}`,
    taskName: taskReq.taskName || 'Unnamed Task',
    taskType: taskReq.taskType || 'CPU',
    priority: PriorityEngine.classifyPriority(score),
    priorityScore: score,
    suitabilityScore: 0,
    cpuRequired: taskReq.cpuRequired ?? 0,
    gpuRequired: taskReq.gpuRequired ?? 0,
    ramRequired: taskReq.ramRequired ?? 0,
    storageRequired: taskReq.storageRequired ?? 0,
    estimatedExecutionTime: taskReq.estimatedExecutionTime ?? 10,
    urgency: taskReq.urgency ?? 0,
    createdAt: Date.now(),
    status: 'READY',
    waitingTimeBonus: 0,
    estimatedCostUsd,
    cpuCostUsd: costBreakdown.cpuCost,
    gpuCostUsd: costBreakdown.gpuCost,
    ramCostUsd: costBreakdown.ramCost,
    storageCostUsd: costBreakdown.storageCost,
    costBreakdown,
    costPenalty,
    effectiveScore,
    schedulingExplanation: `Base Priority: ${score}, Cost Penalty: ${costPenalty > 0 ? `-${costPenalty.toFixed(2)}` : '0.00'} pts, Effective Score: ${effectiveScore.toFixed(2)} (Est. Cost: $${estimatedCostUsd.toFixed(6)})`,
  };

  const suitability = AllocationEngine.calculateSuitability(task);
  task.suitabilityScore = suitability.score;

  if (suitability.suitable) {
    const allocated = AllocationEngine.allocateTask(task);
    if (allocated) {
      QueueEngine.startTask(task);
      res.json({ task, decision: 'ALLOCATED' });
      return;
    }
  }

  QueueEngine.addTaskToQueue(task, suitability.reason || 'Insufficient capacity');
  res.json({ task, decision: 'QUEUED', reason: suitability.reason });
});

router.get('/resources', (req, res) => res.json(resourceManager.getState()));
router.get('/resources/cpu', (req, res) => res.json(resourceManager.getState().cpu));
router.get('/resources/gpu', (req, res) => res.json(resourceManager.getState().gpu));
router.get('/resources/memory', (req, res) => res.json(resourceManager.getState().ram));
router.get('/resources/storage', (req, res) => res.json(resourceManager.getState().storage));

router.get('/queue', (req, res) => res.json(QueueEngine.getQueueStats()));
router.get('/tasks', (req, res) => res.json(QueueEngine.getAllTasks()));

router.get('/metrics', (req, res) => res.json(resourceManager.getUtilization()));
router.get('/metrics/costs', (req, res) => res.json(QueueEngine.getCostMetrics()));

router.get('/status', (req, res) => res.json({ status: 'ONLINE', clusterId: 'CLS-99X' }));

router.post('/release/:taskId', (req, res) => {
  const success = resourceManager.release(req.params.taskId);
  res.json({ success });
});

export default router;

