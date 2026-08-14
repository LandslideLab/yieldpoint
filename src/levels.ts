/**
 * Autonomy levels and their ordering.
 *
 * The scale is inspired by the Knight Institute's five-stage human-agency model
 * (operator -> collaborator -> consultant -> approver -> observer) plus an
 * extra `machine-only` stage that represents full autonomy with no human in
 * the loop at all.
 *
 * Autonomy increases monotonically with the list position. A lower score means
 * the human is more in charge; a higher score means the machine is more in charge.
 */

export const AUTONOMY_LEVELS = [
  'operator',
  'collaborator',
  'consultant',
  'approver',
  'observer',
  'machine-only'
] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const AUTONOMY_SCORES: Record<AutonomyLevel, number> = {
  operator: 0,
  collaborator: 1,
  consultant: 2,
  approver: 3,
  observer: 4,
  'machine-only': 5
};

/**
 * Levels in which a human is expected to participate in the loop:
 * they either operate, collaborate, advise, or approve.
 */
export const HUMAN_IN_THE_LOOP_LEVELS: readonly AutonomyLevel[] = [
  'operator',
  'collaborator',
  'consultant',
  'approver'
];

/**
 * Levels in which a human actually executes the work
 * (the machine merely assists, if at all).
 */
export const HUMAN_EXECUTED_LEVELS: readonly AutonomyLevel[] = [
  'operator',
  'collaborator'
];

/** Numeric autonomy score for a level. Higher means more autonomous. */
export function autonomyScore(level: AutonomyLevel): number {
  return AUTONOMY_SCORES[level];
}

/** True when the given level expects a human to be part of the loop. */
export function isHumanInTheLoop(level: AutonomyLevel): boolean {
  return HUMAN_IN_THE_LOOP_LEVELS.includes(level);
}

/** True when the given level is executed by the human (machine assists). */
export function isHumanExecuted(level: AutonomyLevel): boolean {
  return HUMAN_EXECUTED_LEVELS.includes(level);
}

/** Type guard for arbitrary runtime values. */
export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return typeof value === 'string' && (AUTONOMY_LEVELS as readonly string[]).includes(value);
}
