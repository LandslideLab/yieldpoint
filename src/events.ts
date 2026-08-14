import type { AutonomyLevel } from './levels';
import type { Signals } from './signals';
import type { TransferTrigger } from './trigger';

/** Why a handover happened. */
export interface HandoverReason {
  /** `trigger`: fired by a policy rule. `manual`: explicit call. `policy`: lifecycle event (reset). */
  kind: 'trigger' | 'manual' | 'policy';
  /** Human-readable description of the reason. */
  description: string;
  /** The trigger that fired, when the reason kind is `trigger`. */
  trigger?: TransferTrigger;
  /** The rule that fired, when the reason kind is `trigger`. */
  ruleId?: string;
}

/**
 * An immutable record of a single handover. Objects returned by the engine
 * are shallow-frozen, so a history cannot be mutated after the fact.
 */
export interface HandoverEvent {
  readonly id: string;
  readonly taskId: string;
  /** Unix epoch milliseconds when the handover happened. */
  readonly timestamp: number;
  readonly from: AutonomyLevel;
  readonly to: AutonomyLevel;
  readonly reason: HandoverReason;
  readonly signalSnapshot: Signals;
  readonly policyName?: string;
}

/** Deep-freezes a handover event so it is safe to share. */
export function freezeEvent(event: HandoverEvent): HandoverEvent {
  return Object.freeze({
    ...event,
    reason: Object.freeze({ ...event.reason }),
    signalSnapshot: Object.freeze({ ...event.signalSnapshot })
  });
}
