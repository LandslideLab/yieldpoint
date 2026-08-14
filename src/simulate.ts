import { createHandoverEngine, type HandoverEngine, type UpdateResult } from './engine';
import type { HandoverEvent } from './events';
import { autonomyScore, isHumanInTheLoop, type AutonomyLevel } from './levels';
import type { HandoverPolicy } from './policy';
import type { Signals } from './signals';

/** A single step in a simulation scenario. */
export interface SimulationStep {
  /** Optional step label; defaults to `step-<index>`. */
  id?: string;
  /** Signals fed to the engine at this step. */
  signals: Signals;
  /**
   * The most autonomous level this step may safely run at (inclusive).
   * When the engine runs above this level, the step is flagged unsafe.
   * Omit to treat the step as always safe.
   */
  maxSafeLevel?: AutonomyLevel;
  /**
   * The level that would be ideal for this step (used to interpret `quality`).
   * Defaults to `'consultant'`.
   */
  idealLevel?: AutonomyLevel;
  /**
   * Machine execution quality in [0, 1] for this step. Defaults to 1.
   * When the step is executed by a human instead, quality is credited as 1.
   */
  quality?: number;
  /** Extra human cost when a human executes this step. Defaults to `defaultHumanCost`. */
  humanCost?: number;
}

/** A named scenario made of simulation steps. */
export interface Scenario {
  name: string;
  description?: string;
  /** Overrides the policy's initial level for this scenario. */
  initialLevel?: AutonomyLevel;
  steps: SimulationStep[];
}

/** Tuning knobs for {@link runSimulation}. */
export interface SimulationOptions {
  /** Cost credited whenever a human executes a step. Defaults to 1. */
  defaultHumanCost?: number;
  /** Extra cost credited on each handover that moves control toward the human. Defaults to 0.5. */
  transferCost?: number;
  /** Deterministic clock, passed through to the underlying engine. */
  now?: () => number;
}

/** Per-step results inside a {@link ScenarioResult}. */
export interface SimulationStepResult {
  stepId: string;
  /** The autonomy level in effect when the step executed. */
  level: AutonomyLevel;
  /** Numeric score of `level` (0..5). */
  score: number;
  /** True when `maxSafeLevel` is absent or the step level is at or below it. */
  safe: boolean;
  /** Credited quality for this step in [0, 1]. */
  quality: number;
  /** Credited cost for this step. */
  cost: number;
  /** True when a handover happened at this step. */
  transferHappened: boolean;
  /** The handover event, if any. */
  event: HandoverEvent | null;
}

/** The four-dimensional report for a single scenario. */
export interface SimulationMetrics {
  /** Average credited quality in [0, 1]. */
  quality: number;
  /** Fraction of safe steps in [0, 1]. */
  safety: number;
  /** Average normalized autonomy score in [0, 1] (raw score divided by 5). */
  autonomy: number;
  /** Total human-involvement cost. */
  cost: number;
}

/** Per-scenario results. */
export interface ScenarioResult {
  scenarioName: string;
  description?: string;
  steps: SimulationStepResult[];
  events: HandoverEvent[];
  metrics: SimulationMetrics;
  summary: {
    steps: number;
    safeSteps: number;
    unsafeSteps: number;
    transfers: number;
    humanExecutedSteps: number;
    humanInTheLoopSteps: number;
  };
}

/** The aggregate report produced by {@link runSimulation}. */
export interface SimulationReport {
  results: ScenarioResult[];
  aggregate: SimulationMetrics;
  summary: {
    scenarios: number;
    totalSteps: number;
    safeSteps: number;
    unsafeSteps: number;
    transfers: number;
    humanExecutedSteps: number;
    humanInTheLoopSteps: number;
  };
  /** Convenience alias: `safeSteps / totalSteps` across every scenario. */
  safetyRate: number;
}

const HUMAN_EXECUTED_SCORE = 1;
const DEFAULT_IDEAL_LEVEL: AutonomyLevel = 'consultant';

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Simulates a single scenario against a policy and returns its four-dimensional report.
 */
export function simulateScenario(
  policy: HandoverPolicy,
  scenario: Scenario,
  options: SimulationOptions = {}
): ScenarioResult {
  const defaultHumanCost = options.defaultHumanCost ?? 1;
  const transferCost = options.transferCost ?? 0.5;
  const engine: HandoverEngine = createHandoverEngine(policy, { now: options.now });
  const taskId = scenario.name;
  engine.createTask(taskId, scenario.initialLevel);

  const stepResults: SimulationStepResult[] = [];
  const events: HandoverEvent[] = [];

  scenario.steps.forEach((step, index) => {
    const update: UpdateResult = engine.update(taskId, step.signals);
    if (update.event) events.push(update.event);

    const score = autonomyScore(update.currentLevel);
    const safe =
      step.maxSafeLevel === undefined ? true : score <= autonomyScore(step.maxSafeLevel);

    const idealScore = autonomyScore(step.idealLevel ?? DEFAULT_IDEAL_LEVEL);
    const machineExecuted = score >= idealScore || score > HUMAN_EXECUTED_SCORE;
    const quality = machineExecuted ? (step.quality ?? 1) : 1;

    let cost = 0;
    if (score <= HUMAN_EXECUTED_SCORE) {
      cost += step.humanCost ?? defaultHumanCost;
    }
    if (update.changed && autonomyScore(update.previousLevel) > score) {
      cost += transferCost;
    }

    stepResults.push({
      stepId: step.id ?? `step-${index}`,
      level: update.currentLevel,
      score,
      safe,
      quality,
      cost,
      transferHappened: update.changed,
      event: update.event
    });
  });

  const safeSteps = stepResults.filter((s) => s.safe).length;
  const humanExecutedSteps = stepResults.filter((s) => s.score <= HUMAN_EXECUTED_SCORE).length;
  const humanInTheLoopSteps = stepResults.filter((s) => isHumanInTheLoop(s.level)).length;
  const transfers = events.length;

  const metrics: SimulationMetrics = {
    quality: round(mean(stepResults.map((s) => s.quality))),
    safety: round(safeSteps / Math.max(1, stepResults.length)),
    autonomy: round(mean(stepResults.map((s) => s.score)) / 5),
    cost: round(stepResults.reduce((acc, s) => acc + s.cost, 0))
  };

  return {
    scenarioName: scenario.name,
    description: scenario.description,
    steps: stepResults,
    events,
    metrics,
    summary: {
      steps: stepResults.length,
      safeSteps,
      unsafeSteps: stepResults.length - safeSteps,
      transfers,
      humanExecutedSteps,
      humanInTheLoopSteps
    }
  };
}

/**
 * Simulates a set of scenarios against a policy and produces an aggregate
 * quality / safety / autonomy / cost report plus a full audit trail.
 */
export function runSimulation(
  policy: HandoverPolicy,
  scenarios: Scenario[],
  options: SimulationOptions = {}
): SimulationReport {
  const results = scenarios.map((scenario) => simulateScenario(policy, scenario, options));

  const totalSteps = results.reduce((acc, r) => acc + r.summary.steps, 0);
  const safeSteps = results.reduce((acc, r) => acc + r.summary.safeSteps, 0);
  const transfers = results.reduce((acc, r) => acc + r.summary.transfers, 0);
  const humanExecutedSteps = results.reduce((acc, r) => acc + r.summary.humanExecutedSteps, 0);
  const humanInTheLoopSteps = results.reduce((acc, r) => acc + r.summary.humanInTheLoopSteps, 0);

  const aggregate: SimulationMetrics = {
    quality: round(mean(results.map((r) => r.metrics.quality))),
    safety: round(mean(results.map((r) => r.metrics.safety))),
    autonomy: round(mean(results.map((r) => r.metrics.autonomy))),
    cost: round(results.reduce((acc, r) => acc + r.metrics.cost, 0))
  };

  return {
    results,
    aggregate,
    summary: {
      scenarios: results.length,
      totalSteps,
      safeSteps,
      unsafeSteps: totalSteps - safeSteps,
      transfers,
      humanExecutedSteps,
      humanInTheLoopSteps
    },
    safetyRate: round(safeSteps / Math.max(1, totalSteps))
  };
}

/** Renders a {@link SimulationReport} as a human-readable text block. */
export function formatReport(report: SimulationReport): string {
  const lines: string[] = [];
  lines.push('=== YieldPoint Simulation Report ===');
  lines.push('');
  for (const result of report.results) {
    lines.push(`Scenario: ${result.scenarioName}`);
    if (result.description) lines.push(`  ${result.description}`);
    lines.push(
      `  quality=${result.metrics.quality} safety=${result.metrics.safety} ` +
        `autonomy=${result.metrics.autonomy} cost=${result.metrics.cost}`
    );
    lines.push(
      `  steps=${result.summary.steps} safe=${result.summary.safeSteps} ` +
        `unsafe=${result.summary.unsafeSteps} transfers=${result.summary.transfers}`
    );
    lines.push('');
  }
  lines.push('--- Aggregate ---');
  const a = report.aggregate;
  lines.push(
    `quality=${a.quality} safety=${a.safety} autonomy=${a.autonomy} cost=${a.cost}`
  );
  lines.push(
    `safetyRate=${report.safetyRate} (${report.summary.safeSteps}/${report.summary.totalSteps} steps)`
  );
  lines.push(
    `scenarios=${report.summary.scenarios} transfers=${report.summary.transfers} ` +
      `humanExecuted=${report.summary.humanExecutedSteps} hitlSteps=${report.summary.humanInTheLoopSteps}`
  );
  lines.push('=== End Report ===');
  return lines.join('\n');
}
