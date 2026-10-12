import { CloudTask, TaskPriority } from '../types';

// RAM request (MB) that counts as 100% in the priority formula — the largest worker's RAM.
const RAM_NORMALIZATION_MB = 1024;

export class PriorityEngine {
  public static calculatePriorityScore(task: Partial<CloudTask>): number {
    const cpu = Math.min(task.cpuRequired || 0, 100);
    const ram = task.ramRequired || 0;
    const normalizedRam = Math.min((ram / RAM_NORMALIZATION_MB) * 100, 100);
    const urgency = task.urgency || 0;

    let score = (0.40 * cpu) + (0.30 * normalizedRam) + (0.30 * urgency);

    return Math.min(Math.max(Math.round(score), 0), 100);
  }

  public static classifyPriority(score: number): TaskPriority {
    if (score <= 40) return 'LOW';
    if (score <= 70) return 'MEDIUM';
    return 'HIGH';
  }
}
