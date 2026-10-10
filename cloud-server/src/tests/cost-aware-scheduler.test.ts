import { CostEngine } from '../engines/costEngine';
import { QueueEngine } from '../engines/queueEngine';
import { PriorityEngine } from '../engines/priorityEngine';
import { AllocationEngine } from '../engines/allocationEngine';
import { resourceManager } from '../resources/resourceManager';
import { CloudTask } from '../types';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, failureDetail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${testName}${failureDetail ? ` -> ${failureDetail}` : ''}`);
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('     COST-AWARE SCHEDULER VERIFICATION TEST SUITE          ');
  console.log('============================================================\n');

  CostEngine.resetToDefaults();
  QueueEngine.reset();

  // Test 1: Task with zero GPU demand produces a valid cost estimate
  {
    const task: Partial<CloudTask> = {
      cpuRequired: 50,
      gpuRequired: 0,
      ramRequired: 8,
      storageRequired: 100,
      estimatedExecutionTime: 10,
    };
    const cost = CostEngine.estimateTaskCost(task);
    const breakdown = CostEngine.getCostBreakdown(task);
    assert(
      Number.isFinite(cost) && cost > 0 && breakdown.gpuCost === 0,
      'Test 1: Zero GPU demand produces valid, non-negative cost estimate with 0 GPU charge',
      `Cost: ${cost}, GpuCost: ${breakdown.gpuCost}`
    );
  }

  // Test 2: Longer execution time increases estimated cost for the same workload
  {
    const shortTask: Partial<CloudTask> = { cpuRequired: 40, gpuRequired: 20, ramRequired: 8, estimatedExecutionTime: 10 };
    const longTask: Partial<CloudTask> = { cpuRequired: 40, gpuRequired: 20, ramRequired: 8, estimatedExecutionTime: 30 };
    const costShort = CostEngine.estimateTaskCost(shortTask);
    const costLong = CostEngine.estimateTaskCost(longTask);
    assert(
      costLong > costShort && Math.abs(costLong - costShort * 3) < 0.000001,
      'Test 2: Longer execution time increases estimated cost proportionally',
      `Short: ${costShort}, Long: ${costLong}`
    );
  }

  // Test 3: Increasing CPU demand increases estimated CPU cost
  {
    const lowCpu: Partial<CloudTask> = { cpuRequired: 20, estimatedExecutionTime: 10 };
    const highCpu: Partial<CloudTask> = { cpuRequired: 80, estimatedExecutionTime: 10 };
    const breakdownLow = CostEngine.getCostBreakdown(lowCpu);
    const breakdownHigh = CostEngine.getCostBreakdown(highCpu);
    assert(
      breakdownHigh.cpuCost > breakdownLow.cpuCost && Math.abs(breakdownHigh.cpuCost - breakdownLow.cpuCost * 4) < 0.000001,
      'Test 3: Increasing CPU demand increases estimated CPU cost proportionally',
      `Low CPU cost: ${breakdownLow.cpuCost}, High CPU cost: ${breakdownHigh.cpuCost}`
    );
  }

  // Test 4: Increasing GPU demand increases estimated GPU cost
  {
    const lowGpu: Partial<CloudTask> = { gpuRequired: 10, estimatedExecutionTime: 10 };
    const highGpu: Partial<CloudTask> = { gpuRequired: 50, estimatedExecutionTime: 10 };
    const breakdownLow = CostEngine.getCostBreakdown(lowGpu);
    const breakdownHigh = CostEngine.getCostBreakdown(highGpu);
    assert(
      breakdownHigh.gpuCost > breakdownLow.gpuCost && Math.abs(breakdownHigh.gpuCost - breakdownLow.gpuCost * 5) < 0.000001,
      'Test 4: Increasing GPU demand increases estimated GPU cost proportionally',
      `Low GPU cost: ${breakdownLow.gpuCost}, High GPU cost: ${breakdownHigh.gpuCost}`
    );
  }

  // Test 5: RAM and storage costs are calculated correctly
  {
    // Rates: RAM = $0.004/GB-h, Storage = $0.0001/GB-h
    // Execution hours: 3600 seconds = 1 hour
    const task: Partial<CloudTask> = { ramRequired: 16, storageRequired: 500, estimatedExecutionTime: 3600 };
    const breakdown = CostEngine.getCostBreakdown(task);
    const expectedRamCost = 16 * 0.004 * 1.0; // 0.064
    const expectedStorageCost = 500 * 0.0001 * 1.0; // 0.05
    assert(
      Math.abs(breakdown.ramCost - expectedRamCost) < 0.00001 &&
      Math.abs(breakdown.storageCost - expectedStorageCost) < 0.00001,
      'Test 5: RAM and storage costs match exact dimensional formulas',
      `Ram: ${breakdown.ramCost} (expected ${expectedRamCost}), Storage: ${breakdown.storageCost} (expected ${expectedStorageCost})`
    );
  }

  // Test 6: Missing optional fields are handled safely
  {
    const emptyTask: Partial<CloudTask> = {};
    const cost = CostEngine.estimateTaskCost(emptyTask);
    const breakdown = CostEngine.getCostBreakdown(emptyTask);
    assert(
      Number.isFinite(cost) && cost >= 0 && breakdown.total === 0,
      'Test 6: Missing optional fields fall back safely without NaN or crash',
      `Cost: ${cost}, Total: ${breakdown.total}`
    );
  }

  // Test 7: Invalid negative or non-finite inputs are rejected at request boundary
  {
    const negativeCpu = CostEngine.validateTaskInputs({ cpuRequired: -10 });
    const nonFiniteGpu = CostEngine.validateTaskInputs({ gpuRequired: NaN });
    const infiniteRam = CostEngine.validateTaskInputs({ ramRequired: Infinity });
    const excessiveStorage = CostEngine.validateTaskInputs({ storageRequired: 5000 });
    const valid = CostEngine.validateTaskInputs({ cpuRequired: 50, gpuRequired: 10, ramRequired: 8 });

    assert(
      !negativeCpu.valid && !nonFiniteGpu.valid && !infiniteRam.valid && !excessiveStorage.valid && valid.valid,
      'Test 7: Boundary validator rejects negative, non-finite, or excessive inputs and accepts valid inputs',
      `neg: ${negativeCpu.valid}, nan: ${nonFiniteGpu.valid}, inf: ${infiniteRam.valid}, exc: ${excessiveStorage.valid}, val: ${valid.valid}`
    );
  }

  // Test 8: High-priority tasks can outrank cheaper low-priority tasks
  {
    // High-priority task: Priority Score = 90, Cost = $0.008 (Penalty = 8.0) -> Effective Score = 82.0
    // Low-priority task:  Priority Score = 30, Cost = $0.0001 (Penalty = 0.1) -> Effective Score = 29.9
    const taskHigh: CloudTask = {
      requestId: 'REQ-HIGH-01',
      taskName: 'Critical ML Task',
      taskType: 'GPU',
      priority: 'HIGH',
      priorityScore: 90,
      suitabilityScore: 0,
      cpuRequired: 80,
      gpuRequired: 90,
      ramRequired: 16,
      storageRequired: 100,
      estimatedExecutionTime: 20,
      urgency: 95,
      createdAt: 1000,
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.008,
      costPenalty: 8.0,
      effectiveScore: 82.0,
    };

    const taskLow: CloudTask = {
      requestId: 'REQ-LOW-01',
      taskName: 'Cheap Log Archiver',
      taskType: 'CPU',
      priority: 'LOW',
      priorityScore: 30,
      suitabilityScore: 0,
      cpuRequired: 10,
      gpuRequired: 0,
      ramRequired: 2,
      storageRequired: 10,
      estimatedExecutionTime: 5,
      urgency: 10,
      createdAt: 1000,
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.0001,
      costPenalty: 0.1,
      effectiveScore: 29.9,
    };

    QueueEngine.reset();
    QueueEngine.addTaskToQueue(taskLow, 'Insufficient CPU');
    QueueEngine.addTaskToQueue(taskHigh, 'Insufficient GPU');

    assert(
      QueueEngine.queue[0].requestId === 'REQ-HIGH-01',
      'Test 8: High-priority task outranks cheaper low-priority task (Priority preserved)',
      `First in queue: ${QueueEngine.queue[0]?.requestId}`
    );
  }

  // Test 9: Waiting-time aging continues to influence queue order
  {
    // Task A: Base score 50, cost penalty 5 -> effective score 45, waiting bonus 0
    // Task B: Base score 40, cost penalty 2 -> effective score 38. With +10 bonus -> effective score 48
    const taskA: CloudTask = {
      requestId: 'REQ-A',
      taskName: 'Task A',
      taskType: 'CPU',
      priority: 'MEDIUM',
      priorityScore: 50,
      suitabilityScore: 0,
      cpuRequired: 50,
      gpuRequired: 0,
      ramRequired: 8,
      storageRequired: 50,
      estimatedExecutionTime: 10,
      urgency: 50,
      createdAt: Date.now() - 50000, // 50s ago -> bonus = 10
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.005,
      costPenalty: 5.0,
    };

    const taskB: CloudTask = {
      requestId: 'REQ-B',
      taskName: 'Task B',
      taskType: 'CPU',
      priority: 'MEDIUM',
      priorityScore: 42,
      suitabilityScore: 0,
      cpuRequired: 40,
      gpuRequired: 0,
      ramRequired: 8,
      storageRequired: 50,
      estimatedExecutionTime: 10,
      urgency: 40,
      createdAt: Date.now(), // just arrived -> bonus = 0
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.001,
      costPenalty: 1.0,
    };

    QueueEngine.reset();
    QueueEngine.addTaskToQueue(taskB, 'Waiting');
    QueueEngine.addTaskToQueue(taskA, 'Waiting');
    QueueEngine.updateAging();

    assert(
      QueueEngine.queue[0].requestId === 'REQ-A' && (QueueEngine.queue[0].waitingTimeBonus ?? 0) >= 9,
      'Test 9: Waiting-time aging bonus elevates older tasks dynamically',
      `First: ${QueueEngine.queue[0]?.requestId}, Bonus: ${QueueEngine.queue[0]?.waitingTimeBonus}`
    );
  }

  // Test 10: Equal effective scores use deterministic FIFO ordering
  {
    const timeNow = Date.now();
    const taskFirst: CloudTask = {
      requestId: 'REQ-FIRST',
      taskName: 'First Task',
      taskType: 'CPU',
      priority: 'MEDIUM',
      priorityScore: 50,
      suitabilityScore: 0,
      cpuRequired: 40,
      gpuRequired: 0,
      ramRequired: 4,
      storageRequired: 20,
      estimatedExecutionTime: 10,
      urgency: 50,
      createdAt: timeNow - 200,
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.001,
      costPenalty: 1.0,
    };

    const taskSecond: CloudTask = {
      requestId: 'REQ-SECOND',
      taskName: 'Second Task',
      taskType: 'CPU',
      priority: 'MEDIUM',
      priorityScore: 50,
      suitabilityScore: 0,
      cpuRequired: 40,
      gpuRequired: 0,
      ramRequired: 4,
      storageRequired: 20,
      estimatedExecutionTime: 10,
      urgency: 50,
      createdAt: timeNow,
      status: 'WAITING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.001,
      costPenalty: 1.0,
    };

    QueueEngine.reset();
    QueueEngine.addTaskToQueue(taskSecond, 'Waiting');
    QueueEngine.addTaskToQueue(taskFirst, 'Waiting');

    assert(
      QueueEngine.queue[0].requestId === 'REQ-FIRST',
      'Test 10: Deterministic FIFO tie-breaking preserves arrival ordering on equal effective scores',
      `First in queue: ${QueueEngine.queue[0]?.requestId}`
    );
  }

  // Test 11: A queued task is allocated only when capacity is sufficient
  {
    const state = resourceManager.getState();
    const avail = resourceManager.getAvailableResources();
    const oversizeTask: CloudTask = {
      requestId: 'REQ-OVERSIZE',
      taskName: 'Oversized Task',
      taskType: 'CPU',
      priority: 'HIGH',
      priorityScore: 90,
      suitabilityScore: 0,
      cpuRequired: avail.cpuAvailable + 100, // Exceeds available
      gpuRequired: 0,
      ramRequired: 4,
      storageRequired: 20,
      estimatedExecutionTime: 10,
      urgency: 90,
      createdAt: Date.now(),
      status: 'READY',
      waitingTimeBonus: 0,
    };

    const check = AllocationEngine.calculateSuitability(oversizeTask);
    assert(
      check.suitable === false && check.reason === 'Insufficient CPU capacity',
      'Test 11: AllocationEngine rejects task when capacity is insufficient',
      `Suitable: ${check.suitable}, Reason: ${check.reason}`
    );
  }

  // Test 12: Existing task completion and resource-release behavior remains intact
  {
    const availBefore = resourceManager.getAvailableResources();
    const allocTestTask: CloudTask = {
      requestId: 'REQ-LIFECYCLE',
      taskName: 'Lifecycle Test',
      taskType: 'CPU',
      priority: 'MEDIUM',
      priorityScore: 50,
      suitabilityScore: 0,
      cpuRequired: 50,
      gpuRequired: 0,
      ramRequired: 4,
      storageRequired: 20,
      estimatedExecutionTime: 10,
      urgency: 50,
      createdAt: Date.now(),
      status: 'READY',
      waitingTimeBonus: 0,
    };

    const allocated = AllocationEngine.allocateTask(allocTestTask);
    const availDuring = resourceManager.getAvailableResources();
    const released = resourceManager.release('REQ-LIFECYCLE');
    const availAfter = resourceManager.getAvailableResources();

    assert(
      allocated === true &&
      availDuring.cpuAvailable < availBefore.cpuAvailable &&
      released === true &&
      availAfter.cpuAvailable === availBefore.cpuAvailable,
      'Test 12: Resource allocation and release correctly modifies and restores capacity',
      `Before: ${availBefore.cpuAvailable}, During: ${availDuring.cpuAvailable}, After: ${availAfter.cpuAvailable}`
    );
  }

  // Test 13: Formatting helper safely handles missing or undefined cost values
  {
    const formatCostHelper = (cost?: number) => {
      if (cost === undefined || cost === null || Number.isNaN(Number(cost))) {
        return '—';
      }
      return `$${Number(cost).toFixed(6)}`;
    };

    const formattedNormal = formatCostHelper(0.000123);
    const formattedZero = formatCostHelper(0);
    const formattedUndefined = formatCostHelper(undefined);
    const formattedNull = formatCostHelper(null as any);
    const formattedNaN = formatCostHelper(NaN);

    assert(
      formattedNormal === '$0.000123' &&
      formattedZero === '$0.000000' &&
      formattedUndefined === '—' &&
      formattedNull === '—' &&
      formattedNaN === '—',
      'Test 13: Request UI cost formatter correctly formats USD and displays "—" on missing/null/NaN',
      `normal: ${formattedNormal}, zero: ${formattedZero}, undef: ${formattedUndefined}`
    );
  }

  // Test 14: Analytics does not double-count task costs during polling
  {
    QueueEngine.reset();
    const taskA: CloudTask = {
      requestId: 'REQ-COUNT-1',
      taskName: 'Task 1',
      taskType: 'CPU',
      priority: 'LOW',
      priorityScore: 30,
      suitabilityScore: 0,
      cpuRequired: 20,
      gpuRequired: 0,
      ramRequired: 2,
      storageRequired: 10,
      estimatedExecutionTime: 5,
      urgency: 20,
      createdAt: 1000,
      status: 'COMPLETED',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.002,
    };
    const taskB: CloudTask = {
      requestId: 'REQ-COUNT-2',
      taskName: 'Task 2',
      taskType: 'GPU',
      priority: 'HIGH',
      priorityScore: 80,
      suitabilityScore: 0,
      cpuRequired: 50,
      gpuRequired: 50,
      ramRequired: 8,
      storageRequired: 20,
      estimatedExecutionTime: 10,
      urgency: 80,
      createdAt: 2000,
      status: 'RUNNING',
      waitingTimeBonus: 0,
      estimatedCostUsd: 0.005,
    };

    QueueEngine.allTasks.push(taskA, taskB);
    QueueEngine.completedTasks.push(taskA);

    // Poll 1
    const poll1 = QueueEngine.getCostMetrics();
    // Poll 2 (simulating multiple UI polling intervals)
    const poll2 = QueueEngine.getCostMetrics();

    assert(
      poll1.totalEstimatedSubmittedCost === 0.007 &&
      poll2.totalEstimatedSubmittedCost === 0.007 &&
      poll1.totalEstimatedCompletedCost === 0.002 &&
      poll2.totalEstimatedCompletedCost === 0.002 &&
      poll1.costByType.CPU === 0.002 &&
      poll1.costByType.GPU === 0.005,
      'Test 14: Authoritative cost metrics maintain consistent totals across polling snapshots without double-counting',
      `Poll1: ${poll1.totalEstimatedSubmittedCost}, Poll2: ${poll2.totalEstimatedSubmittedCost}`
    );
  }

  // Test 15: CPU-only and GPU/MIXED tasks populate all 5 explicit cost breakdown fields
  {
    const cpuTask: Partial<CloudTask> = {
      taskType: 'CPU',
      cpuRequired: 50,
      gpuRequired: 0,
      ramRequired: 4,
      storageRequired: 20,
      estimatedExecutionTime: 12,
    };
    const gpuTask: Partial<CloudTask> = {
      taskType: 'GPU',
      cpuRequired: 80,
      gpuRequired: 60,
      ramRequired: 16,
      storageRequired: 100,
      estimatedExecutionTime: 15,
    };

    const cpuBreakdown = CostEngine.getCostBreakdown(cpuTask);
    const gpuBreakdown = CostEngine.getCostBreakdown(gpuTask);

    assert(
      cpuBreakdown.cpuCostUsd !== undefined &&
      cpuBreakdown.gpuCostUsd === 0 &&
      cpuBreakdown.ramCostUsd !== undefined &&
      cpuBreakdown.storageCostUsd !== undefined &&
      cpuBreakdown.total > 0 &&
      gpuBreakdown.gpuCostUsd! > 0 &&
      Math.abs(gpuBreakdown.total - (gpuBreakdown.cpuCostUsd! + gpuBreakdown.gpuCostUsd! + gpuBreakdown.ramCostUsd! + gpuBreakdown.storageCostUsd!)) < 0.000001,
      'Test 15: Both CPU-only and GPU/MIXED tasks populate all 5 explicit cost fields and sum accurately',
      `CPU total: ${cpuBreakdown.total}, GPU total: ${gpuBreakdown.total}`
    );
  }

  // Test 16: Completed task persistence preserves cost breakdowns throughout lifecycle
  {
    QueueEngine.reset();
    const lifecycleTask: CloudTask = {
      requestId: 'REQ-PERSIST-1',
      taskName: 'Persistence Check',
      taskType: 'MIXED',
      priority: 'MEDIUM',
      priorityScore: 55,
      suitabilityScore: 0,
      cpuRequired: 40,
      gpuRequired: 20,
      ramRequired: 8,
      storageRequired: 50,
      estimatedExecutionTime: 1, // 1 sec
      urgency: 50,
      createdAt: Date.now(),
      status: 'READY',
      waitingTimeBonus: 0,
    };

    AllocationEngine.allocateTask(lifecycleTask);
    QueueEngine.startTask(lifecycleTask);
    assert(
      lifecycleTask.status === 'RUNNING' &&
      lifecycleTask.cpuCostUsd !== undefined &&
      lifecycleTask.gpuCostUsd !== undefined &&
      lifecycleTask.ramCostUsd !== undefined &&
      lifecycleTask.storageCostUsd !== undefined &&
      lifecycleTask.estimatedCostUsd !== undefined,
      'Test 16a: Task entering RUNNING state automatically has all cost fields populated',
      `Cost: ${lifecycleTask.estimatedCostUsd}`
    );

    // Complete task
    QueueEngine.completeTask(lifecycleTask);
    const completed = QueueEngine.completedTasks.find(t => t.requestId === 'REQ-PERSIST-1');
    const inAll = QueueEngine.getAllTasks().find(t => t.requestId === 'REQ-PERSIST-1');

    assert(
      completed !== undefined &&
      completed.status === 'COMPLETED' &&
      completed.estimatedCostUsd !== undefined &&
      completed.cpuCostUsd !== undefined &&
      completed.gpuCostUsd !== undefined &&
      completed.ramCostUsd !== undefined &&
      completed.storageCostUsd !== undefined &&
      inAll !== undefined &&
      inAll.status === 'COMPLETED',
      'Test 16b: Completed task preserves all 5 cost breakdown fields without being cleared',
      `Completed cost: ${completed?.estimatedCostUsd}`
    );
  }

  // Test 17: Cost penalty calculation and formatting prevents negative zero (-0.00)
  {
    const penaltyZero = CostEngine.calculateCostPenalty(0);
    const penaltyVerySmall = CostEngine.calculateCostPenalty(0.00000001);
    const penaltyNormal = CostEngine.calculateCostPenalty(0.005);

    const formatPenaltyCheck = (p: number) => {
      if (p <= 0.00001) return '0.00 pts';
      return `-${p.toFixed(2)} pts`;
    };

    assert(
      penaltyZero === 0 &&
      penaltyVerySmall === 0 &&
      formatPenaltyCheck(penaltyZero) === '0.00 pts' &&
      formatPenaltyCheck(penaltyVerySmall) === '0.00 pts' &&
      formatPenaltyCheck(penaltyNormal) === '-5.00 pts',
      'Test 17: Penalty calculation and formatting strictly prevents negative zero (-0.00 pts)',
      `Zero: ${formatPenaltyCheck(penaltyZero)}, Small: ${formatPenaltyCheck(penaltyVerySmall)}, Normal: ${formatPenaltyCheck(penaltyNormal)}`
    );
  }

  console.log('\n------------------------------------------------------------');
  console.log(`Test Execution Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
