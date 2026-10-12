import { CloudTask } from '../types';
import { resourceManager } from '../resources/resourceManager';

export class AllocationEngine {
  public static calculateSuitability(task: CloudTask): { suitable: boolean, score: number, nodeId?: string, reason?: string } {
    const availability = resourceManager.getNodeAvailability();
    if (availability.length === 0) return { suitable: false, score: 0, reason: 'No worker nodes online' };

    const node = resourceManager.findNodeFor(task);
    if (!node) return { suitable: false, score: 0, reason: this.explainNoFit(task, availability) };

    const free = availability.find(a => a.node.id === node.id)!.free;
    const cpuAvailScore = (free.cpu / node.capacity.cpu) * 100;
    const ramAvailScore = (free.ramMb / node.capacity.ramMb) * 100;

    const resourceAvailabilityScore = (cpuAvailScore + ramAvailScore) / 2;
    const suitabilityScore = Math.round(task.priorityScore + (resourceAvailabilityScore * 0.5));

    return { suitable: true, score: suitabilityScore, nodeId: node.id };
  }

  /** Names the resource that no single node has enough of. */
  private static explainNoFit(task: CloudTask, availability: ReturnType<typeof resourceManager.getNodeAvailability>): string {
    if (!availability.some(a => a.free.cpu >= task.cpuRequired)) return 'Insufficient CPU capacity';
    if (!availability.some(a => a.free.ramMb >= task.ramRequired)) return 'Insufficient RAM capacity';
    if (!availability.some(a => a.free.storageMb >= task.storageRequired)) return 'Insufficient Storage capacity';
    return 'No single node has enough CPU, RAM and storage together';
  }

  public static allocateTask(task: CloudTask): boolean {
    const allocation = resourceManager.allocate({
      taskId: task.requestId,
      cpuRequired: task.cpuRequired,
      ramRequired: task.ramRequired,
      storageRequired: task.storageRequired
    });
    if (allocation) {
      task.allocations = allocation;
      return true;
    }
    return false;
  }
}
