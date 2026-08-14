import { isAutonomyLevel, type AutonomyLevel } from './levels';
import type { TransferTrigger } from './trigger';
import { validateTrigger } from './trigger';

/** A single transfer rule inside a policy. */
export interface TransferRule {
  /** Optional stable identifier; defaults to `rule-<index>`. */
  id?: string;
  /**
   * Source levels this rule applies to. Defaults to `'any'`, meaning the rule
   * can fire from any current level.
   */
  from?: AutonomyLevel[] | 'any';
  /** All triggers must fire simultaneously for the rule to match. */
  when: TransferTrigger[];
  /** Target autonomy level when the rule fires. */
  to: AutonomyLevel;
  /** Higher priority wins; ties fall back to declaration order. Defaults to 0. */
  priority?: number;
}

/**
 * A declarative handover policy: where tasks start and which rules move
 * control between humans and the machine as signals evolve.
 */
export interface HandoverPolicy {
  /** Optional policy name, recorded on every handover event. */
  name?: string;
  /** The autonomy level a new task starts at. */
  initialLevel: AutonomyLevel;
  /** Transfer rules, evaluated from highest priority to lowest. */
  rules: TransferRule[];
}

/** A policy rule with defaults applied and a guaranteed id. */
export interface NormalizedRule {
  id: string;
  from: AutonomyLevel[] | 'any';
  when: readonly TransferTrigger[];
  to: AutonomyLevel;
  priority: number;
}

/** Applies defaults to every rule and assigns stable ids. */
export function normalizePolicy(policy: HandoverPolicy): NormalizedRule[] {
  return policy.rules.map((rule, index) => {
    const id = rule.id ?? `rule-${index}`;
    return {
      id,
      from: rule.from ?? 'any',
      when: rule.when ?? [],
      to: rule.to,
      priority: rule.priority ?? 0
    };
  });
}

/** Throws `TypeError` when the policy is structurally invalid. */
export function validatePolicy(policy: HandoverPolicy): void {
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new TypeError('policy must be an object');
  }
  if (!isAutonomyLevel(policy.initialLevel)) {
    throw new TypeError(`policy.initialLevel must be a valid AutonomyLevel, got ${String(policy.initialLevel)}`);
  }
  if (!Array.isArray(policy.rules)) {
    throw new TypeError('policy.rules must be an array');
  }
  const seenIds = new Set<string>();
  for (const rule of policy.rules) {
    if (rule === null || typeof rule !== 'object') {
      throw new TypeError('each policy rule must be an object');
    }
    if (!isAutonomyLevel(rule.to)) {
      throw new TypeError(`rule '${rule.id ?? '<unnamed>'}' has an invalid target level: ${String(rule.to)}`);
    }
    if (rule.from !== undefined && rule.from !== 'any') {
      if (!Array.isArray(rule.from) || rule.from.some((l) => !isAutonomyLevel(l))) {
        throw new TypeError(`rule '${rule.id ?? '<unnamed>'}' has an invalid 'from' list`);
      }
    }
    if (!Array.isArray(rule.when) || rule.when.length === 0) {
      throw new TypeError(`rule '${rule.id ?? '<unnamed>'}' must declare at least one trigger in 'when'`);
    }
    for (const trigger of rule.when) {
      validateTrigger(trigger);
    }
    if (rule.id !== undefined) {
      if (seenIds.has(rule.id)) {
        throw new TypeError(`duplicate rule id '${rule.id}'`);
      }
      seenIds.add(rule.id);
    }
  }
}

/** Sorts normalized rules by priority (descending), keeping stable order. */
export function sortRulesByPriority(rules: NormalizedRule[]): NormalizedRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority);
}
