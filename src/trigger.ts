import type { AutonomyLevel } from './levels';
import type { HandoverEvent } from './events';
import type { Signals } from './signals';

/** Read-only context handed to triggers while they are being evaluated. */
export interface TriggerContext {
  taskId: string;
  currentLevel: AutonomyLevel;
  signals: Signals;
  elapsedMs: number;
  history: readonly HandoverEvent[];
}

/**
 * A discriminated union of every built-in handover trigger plus a
 * `custom` escape hatch for application-specific signals.
 *
 * - `confidence`: machine confidence, thresholds `below` / `above`.
 * - `risk`:       operational risk, thresholds `above` / `below`.
 * - `cost`:       human-involvement cost, thresholds `above` / `below`.
 * - `timeout`:    fires once the task has been running for at least `afterMs`.
 * - `human-request`: fires when `signals.humanRequest === true`.
 * - `signal`:     generic named signal with `below` / `above` thresholds.
 * - `custom`:     arbitrary predicate over the full trigger context.
 */
export type TransferTrigger =
  | { type: 'confidence'; below?: number; above?: number }
  | { type: 'risk'; above?: number; below?: number }
  | { type: 'cost'; above?: number; below?: number }
  | { type: 'timeout'; afterMs: number }
  | { type: 'human-request' }
  | { type: 'signal'; name: string; below?: number; above?: number }
  | { type: 'custom'; test: (ctx: TriggerContext) => boolean };

const THRESHOLD_TRIGGER_TYPES = new Set(['confidence', 'risk', 'cost', 'signal']);

/** True when the given value satisfies a lower-bound threshold, if present. */
function isBelow(value: number, threshold: number | undefined): boolean {
  return threshold === undefined || value < threshold;
}

/** True when the given value satisfies an upper-bound threshold, if present. */
function isAbove(value: number, threshold: number | undefined): boolean {
  return threshold === undefined || value > threshold;
}

/** Resolve a numeric signal for threshold-style triggers. */
function numericSignal(trigger: TransferTrigger, signals: Signals): number | undefined {
  if (trigger.type === 'signal') {
    const value = signals[trigger.name];
    return typeof value === 'number' ? value : undefined;
  }
  return signals[trigger.type] as number | undefined;
}

/** True when the trigger currently fires against the given context. */
export function matchesTrigger(trigger: TransferTrigger, ctx: TriggerContext): boolean {
  switch (trigger.type) {
    case 'confidence':
    case 'risk':
    case 'cost': {
      const value = numericSignal(trigger, ctx.signals);
      if (value === undefined) return false;
      return isBelow(value, trigger.below) && isAbove(value, trigger.above);
    }
    case 'signal': {
      const value = numericSignal(trigger, ctx.signals);
      if (value === undefined) return false;
      return isBelow(value, trigger.below) && isAbove(value, trigger.above);
    }
    case 'timeout':
      return ctx.elapsedMs >= trigger.afterMs;
    case 'human-request':
      return ctx.signals.humanRequest === true;
    case 'custom':
      return Boolean(trigger.test(ctx));
    default:
      return false;
  }
}

/** True when every trigger in the list fires against the given context. */
export function matchesAll(triggers: readonly TransferTrigger[], ctx: TriggerContext): boolean {
  return triggers.every((t) => matchesTrigger(t, ctx));
}

/** Throws `TypeError` when a trigger object is structurally invalid. */
export function validateTrigger(trigger: TransferTrigger): void {
  if (trigger === null || typeof trigger !== 'object') {
    throw new TypeError('trigger must be an object');
  }
  if (trigger.type === 'custom') {
    if (typeof trigger.test !== 'function') {
      throw new TypeError('custom trigger requires a `test` function');
    }
    return;
  }
  if (trigger.type === 'timeout') {
    if (typeof trigger.afterMs !== 'number' || trigger.afterMs < 0) {
      throw new TypeError('timeout trigger requires non-negative `afterMs`');
    }
    return;
  }
  if (trigger.type === 'human-request') {
    return;
  }
  if (trigger.type === 'signal' && typeof trigger.name !== 'string') {
    throw new TypeError('signal trigger requires a `name` string');
  }
  if (THRESHOLD_TRIGGER_TYPES.has(trigger.type)) {
    for (const key of ['below', 'above'] as const) {
      const value = (trigger as Record<string, unknown>)[key];
      if (value !== undefined && (typeof value !== 'number' || Number.isNaN(value))) {
        throw new TypeError(`trigger.${key} must be a number`);
      }
    }
  }
}
