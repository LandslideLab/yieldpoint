import type { AutonomyLevel } from './levels';
import type { HandoverEvent } from './events';
import type { Signals } from './signals';

/**
 * The runtime state of a single task inside an engine: where control currently
 * sits, the latest signals, and the full (immutable) handover history.
 */
export interface AutonomyContext {
  readonly taskId: string;
  readonly currentLevel: AutonomyLevel;
  readonly signals: Signals;
  readonly history: readonly HandoverEvent[];
  readonly startedAt: number;
  readonly lastUpdatedAt: number;
}
