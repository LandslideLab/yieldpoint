/**
 * Runtime signals that the engine observes to decide whether control should
 * move between a human and a machine.
 *
 * All fields are optional; an engine only looks at the signals that its policy
 * actually references. Extra fields are preserved and can be read by
 * `signal` triggers or `custom` triggers.
 */
export interface Signals {
  /** Machine confidence in its own latest output, in [0, 1]. */
  confidence?: number;
  /** Estimated operational risk of proceeding right now, in [0, 1]. */
  risk?: number;
  /** Cost of pulling a human into the loop at this point (arbitrary units). */
  cost?: number;
  /** One-shot flag: a human explicitly asked to take control. Consumed by the engine after an update. */
  humanRequest?: boolean;
  /** Elapsed task time in milliseconds. Overrides the engine clock when provided. */
  elapsedMs?: number;
  /** Arbitrary additional signal keys. */
  [key: string]: unknown;
}

/** Performs structural validation on a signals object. Throws `TypeError` on invalid values. */
export function validateSignals(signals: Signals): void {
  if (signals === null || typeof signals !== 'object' || Array.isArray(signals)) {
    throw new TypeError('signals must be a plain object');
  }
  for (const key of ['confidence', 'risk', 'cost'] as const) {
    const value = signals[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new TypeError(`signals.${key} must be a number, got ${String(value)}`);
    }
    if (key !== 'cost' && (value < 0 || value > 1)) {
      throw new TypeError(`signals.${key} must be within [0, 1], got ${value}`);
    }
  }
  if (signals.humanRequest !== undefined && typeof signals.humanRequest !== 'boolean') {
    throw new TypeError('signals.humanRequest must be a boolean');
  }
  if (signals.elapsedMs !== undefined && typeof signals.elapsedMs !== 'number') {
    throw new TypeError('signals.elapsedMs must be a number');
  }
}
