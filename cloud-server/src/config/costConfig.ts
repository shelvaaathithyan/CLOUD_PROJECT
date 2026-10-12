/**
 * Simulation Cost Rates and Cost-Aware Scheduling Configuration
 *
 * NOTE: These rates are illustrative simulation values designed for algorithm modeling
 * and queue prioritization, NOT verified or real AWS charges.
 */

export interface SimulationCostRates {
  /** Cost in USD per hour for 100 CPU allocation units */
  cpuRatePerHour: number;
  /** Cost in USD per GB-hour of RAM */
  ramRatePerGbHour: number;
  /** Cost in USD per GB-hour of storage */
  storageRatePerGbHour: number;
}

export interface CostSchedulingConfig {
  /**
   * Currency denomination used across all estimates.
   */
  currency: string;
  /**
   * Cost normalization constant (in USD).
   * Determines how much cost maps to 1 penalty point.
   * Default: 0.00001 USD per penalty point (sized so typical tasks of a few
   * seconds on a fraction of a core get a penalty of roughly 1–10 points).
   */
  costNormalizationUnit: number;
  /**
   * Maximum penalty points that can be deducted from a task's priority score.
   * Prevents expensive tasks from being completely starved if they have high priority.
   * Default: 10 points.
   */
  maxCostPenalty: number;
}

/**
 * Default Illustrative Simulation Rates (USD)
 * - CPU: $0.034 / hour per 100 CPU units
 * - RAM: $0.004 / GB-hour
 * - Storage: $0.0001 / GB-hour
 */
export const DEFAULT_SIMULATION_RATES: SimulationCostRates = {
  cpuRatePerHour: Number(process.env.SIM_CPU_RATE_PER_HOUR) || 0.034,
  ramRatePerGbHour: Number(process.env.SIM_RAM_RATE_PER_GB_HOUR) || 0.004,
  storageRatePerGbHour: Number(process.env.SIM_STORAGE_RATE_PER_GB_HOUR) || 0.0001,
};

/**
 * Default Cost-Aware Scheduling Policy Constants
 * - costPenalty = min(estimatedCostUsd / 0.00001, 10)
 * - effectiveScore = priorityScore + waitingTimeBonus - costPenalty
 */
export const DEFAULT_SCHEDULING_CONFIG: CostSchedulingConfig = {
  currency: 'USD',
  costNormalizationUnit: Number(process.env.SIM_COST_NORM_UNIT) || 0.00001,
  maxCostPenalty: Number(process.env.SIM_MAX_COST_PENALTY) || 10.0,
};
