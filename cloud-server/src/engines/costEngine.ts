import { CloudTask, TaskCostBreakdown } from '../types';
import {
  DEFAULT_SIMULATION_RATES,
  DEFAULT_SCHEDULING_CONFIG,
  SimulationCostRates,
  CostSchedulingConfig,
} from '../config/costConfig';

/**
 * CostEngine
 *
 * Provides simulation-based cloud task cost estimation and cost penalty calculations.
 *
 * NOTE: These estimates model virtual consumption under illustrative simulation rates.
 * They do not reflect real AWS invoices or vendor-specific charges.
 */
export class CostEngine {
  private static rates: SimulationCostRates = { ...DEFAULT_SIMULATION_RATES };
  private static config: CostSchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG };

  /**
   * Update the simulation rates dynamically (e.g. for testing or provider reconfiguration).
   */
  public static setRates(newRates: Partial<SimulationCostRates>): void {
    this.rates = { ...this.rates, ...newRates };
  }

  /**
   * Retrieve current simulation pricing rates.
   */
  public static getRates(): SimulationCostRates {
    return { ...this.rates };
  }

  /**
   * Update the cost scheduling configuration.
   */
  public static setSchedulingConfig(newConfig: Partial<CostSchedulingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Retrieve current scheduling configuration.
   */
  public static getSchedulingConfig(): CostSchedulingConfig {
    return { ...this.config };
  }

  /**
   * Reset rates and configuration back to system defaults.
   */
  public static resetToDefaults(): void {
    this.rates = { ...DEFAULT_SIMULATION_RATES };
    this.config = { ...DEFAULT_SCHEDULING_CONFIG };
  }

  /**
   * Estimates the cost of a task in USD and returns the total cost.
   *
   * @param task Partial task containing resource demands and estimated execution time
   * @returns Total estimated cost in USD (non-negative)
   */
  public static estimateTaskCost(task: Partial<CloudTask>): number {
    return this.getCostBreakdown(task).total;
  }

  /**
   * Computes a structured breakdown of costs across CPU, RAM, and Storage.
   *
   * Execution hours = estimatedExecutionTime (seconds) / 3600
   * CPU cost     = (cpuRequired / 100) × cpuRatePerHour × executionHours
   * RAM cost     = (ramRequired MB / 1024) × ramRatePerGbHour × executionHours
   * Storage cost = (storageRequired MB / 1024) × storageRatePerGbHour × executionHours
   *
   * @param task Partial task
   * @returns TaskCostBreakdown object with component costs and total
   */
  public static getCostBreakdown(task: Partial<CloudTask>): TaskCostBreakdown {
    const rawExecutionTime = Number(task.estimatedExecutionTime ?? 10);
    const executionSeconds = Number.isFinite(rawExecutionTime) && rawExecutionTime > 0 ? rawExecutionTime : 10;
    const executionHours = executionSeconds / 3600;

    const rawCpu = Number(task.cpuRequired ?? 0);
    const cpu = Number.isFinite(rawCpu) && rawCpu >= 0 ? rawCpu : 0;

    const rawRam = Number(task.ramRequired ?? 0);
    const ramGb = (Number.isFinite(rawRam) && rawRam >= 0 ? rawRam : 0) / 1024;

    const rawStorage = Number(task.storageRequired ?? 0);
    const storageGb = (Number.isFinite(rawStorage) && rawStorage >= 0 ? rawStorage : 0) / 1024;

    const cpuCost = (cpu / 100) * this.rates.cpuRatePerHour * executionHours;
    const ramCost = ramGb * this.rates.ramRatePerGbHour * executionHours;
    const storageCost = storageGb * this.rates.storageRatePerGbHour * executionHours;

    const total = Math.max(0, cpuCost + ramCost + storageCost);

    return {
      cpuCost: Math.max(0, cpuCost),
      ramCost: Math.max(0, ramCost),
      storageCost: Math.max(0, storageCost),
      cpuCostUsd: Math.max(0, cpuCost),
      ramCostUsd: Math.max(0, ramCost),
      storageCostUsd: Math.max(0, storageCost),
      total,
    };
  }

  /**
   * Computes the cost penalty applied against the task's priority score.
   *
   * Penalty formula:
   *   costPenalty = min(estimatedCostUsd / costNormalizationUnit, maxCostPenalty)
   *
   * Default: min(estimatedCostUsd / 0.00001, 10.0)
   *
   * @param estimatedCostUsd Estimated cost of the task in USD
   * @returns Cost penalty points (between 0 and maxCostPenalty)
   */
  public static calculateCostPenalty(estimatedCostUsd: number): number {
    if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0.0000001) {
      return 0;
    }
    const penalty = estimatedCostUsd / this.config.costNormalizationUnit;
    const clamped = Math.min(Math.max(penalty, 0), this.config.maxCostPenalty);
    return clamped <= 0.00001 ? 0 : Number(clamped.toFixed(4));
  }

  /**
   * Computes the effective scheduling score for queue sorting:
   *   effectiveScore = priorityScore + waitingTimeBonus - costPenalty
   *
   * @param priorityScore Base priority score (0-100)
   * @param waitingTimeBonus Waiting time aging bonus (>= 0)
   * @param estimatedCostUsd Estimated task cost in USD
   * @returns Effective score (rounded to 2 decimal places)
   */
  public static calculateEffectiveScore(
    priorityScore: number,
    waitingTimeBonus: number = 0,
    estimatedCostUsd: number = 0
  ): number {
    const penalty = this.calculateCostPenalty(estimatedCostUsd);
    const rawScore = (priorityScore || 0) + (waitingTimeBonus || 0) - penalty;
    return Number(rawScore.toFixed(4));
  }

  /**
   * Validates task request inputs at the HTTP request boundary.
   * Rejects missing or non-finite numbers, negative values, and excessive numbers.
   *
   * @param req Raw request body
   */
  public static validateTaskInputs(req: any): { valid: boolean; error?: string } {
    if (!req || typeof req !== 'object') {
      return { valid: false, error: 'Request body must be a valid JSON object.' };
    }

    const numericFields: Array<{
      name: string;
      value: any;
      required: boolean;
      min: number;
      max: number;
    }> = [
      { name: 'cpuRequired', value: req.cpuRequired, required: false, min: 0, max: 400 },
      { name: 'ramRequired', value: req.ramRequired, required: false, min: 0, max: 4096 },
      { name: 'storageRequired', value: req.storageRequired, required: false, min: 0, max: 4096 },
      { name: 'estimatedExecutionTime', value: req.estimatedExecutionTime, required: false, min: 1, max: 86400 },
      { name: 'urgency', value: req.urgency, required: false, min: 0, max: 100 },
    ];

    for (const field of numericFields) {
      if (field.value !== undefined && field.value !== null) {
        if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
          return {
            valid: false,
            error: `Field '${field.name}' must be a finite number. Received: ${field.value}`,
          };
        }
        if (field.value < field.min) {
          return {
            valid: false,
            error: `Field '${field.name}' cannot be less than ${field.min}. Received: ${field.value}`,
          };
        }
        if (field.value > field.max) {
          return {
            valid: false,
            error: `Field '${field.name}' exceeds the maximum allowed limit of ${field.max}. Received: ${field.value}`,
          };
        }
      }
    }

    if (req.taskType !== undefined && req.taskType !== null) {
      if (!['CPU', 'MEMORY', 'MIXED'].includes(req.taskType)) {
        return {
          valid: false,
          error: `Field 'taskType' must be one of: 'CPU', 'MEMORY', 'MIXED'. Received: ${req.taskType}`,
        };
      }
    }

    return { valid: true };
  }
}
