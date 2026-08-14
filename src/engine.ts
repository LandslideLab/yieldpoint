import type { AutonomyContext } from './context';
import { freezeEvent, type HandoverEvent, type HandoverReason } from './events';
import { autonomyScore, isAutonomyLevel, type AutonomyLevel } from './levels';
import {
  normalizePolicy,
  sortRulesByPriority,
  validatePolicy,
  type HandoverPolicy,
  type NormalizedRule
} from './policy';
import { validateSignals, type Signals } from './signals';
import { matchesAll, type TriggerContext } from './trigger';

/** Options accepted by {@link createHandoverEngine}. */
export interface EngineOptions {
  /** Clock used for timestamps and elapsed-time computation. Defaults to `Date.now`. */
  now?: () => number;
  /** Event id generator. Defaults to `crypto.randomUUID` with a fallback. */
  createId?: () => string;
  /** Maximum number of events kept per task. Defaults to 1000. */
  maxHistory?: number;
  /** Throw on structurally invalid signals. Defaults to `true`. */
  validateSignals?: boolean;
  /** Implicitly create a task on the first update/tick call. Defaults to `false`. */
  autoCreate?: boolean;
}

/** The result of an {@link HandoverEngine.update} or {@link HandoverEngine.tick} call. */
export interface UpdateResult {
  taskId: string;
  previousLevel: AutonomyLevel;
  currentLevel: AutonomyLevel;
  /** True when a handover actually happened during this update. */
  changed: boolean;
  /** The handover event, when one happened. */
  event: HandoverEvent | null;
  /** The full merged signal snapshot that was evaluated. */
  appliedSignals: Signals;
  /** Elapsed milliseconds at evaluation time. */
  elapsedMs: number;
  /** The id of the rule that fired, when a rule fired (even if the level did not change). */
  matchedRuleId?: string;
}

/** Listener type for engine handover notifications. */
export type HandoverListener = (event: HandoverEvent) => void;

/** A framework-agnostic dynamic power handover engine. */
export interface HandoverEngine {
  /** The immutable policy this engine was created with. */
  getPolicy(): HandoverPolicy;
  /** Create a new tracked task. Throws when the task already exists. */
  createTask(taskId: string, initialLevel?: AutonomyLevel): AutonomyContext;
  /** Whether a task is currently tracked by this engine. */
  hasTask(taskId: string): boolean;
  /** Read-only snapshot of a task's runtime state. Throws when the task is unknown. */
  getContext(taskId: string): AutonomyContext;
  /** Feed new signals in and let the policy decide whether control moves. */
  update(taskId: string, signals?: Signals): UpdateResult;
  /** Re-evaluate timeout-style rules with the current clock, without new signals. */
  tick(taskId: string): UpdateResult;
  /** Explicitly move control to a level. Returns `null` when the level is unchanged. */
  transfer(taskId: string, to: AutonomyLevel, reason?: string): HandoverEvent | null;
  /** Shortcut for `update(taskId, { humanRequest: true })`. */
  requestHuman(taskId: string): UpdateResult;
  /** Reset a task: clears history (recording a `policy` event) and restores a level. */
  reset(taskId: string, initialLevel?: AutonomyLevel): void;
  /** Stop tracking a task. */
  removeTask(taskId: string): void;
  /** Full immutable handover history for a task. */
  history(taskId: string): readonly HandoverEvent[];
  /** Subscribe to handover events. Returns an unsubscribe function. */
  subscribe(listener: HandoverListener): () => void;
}

interface TaskState {
  taskId: string;
  currentLevel: AutonomyLevel;
  signals: Signals;
  history: HandoverEvent[];
  startedAt: number;
  lastUpdatedAt: number;
  initialLevel: AutonomyLevel;
}

function defaultCreateId(): string {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSignals(signals: Signals): Signals {
  return { ...signals };
}

/** Creates a new framework-agnostic handover engine from a declarative policy. */
export function createHandoverEngine(policy: HandoverPolicy, options: EngineOptions = {}): HandoverEngine {
  validatePolicy(policy);

  const now = options.now ?? Date.now;
  const createId = options.createId ?? defaultCreateId;
  const maxHistory = options.maxHistory ?? 1000;
  const validate = options.validateSignals ?? true;
  const autoCreate = options.autoCreate ?? false;

  const normalized = sortRulesByPriority(normalizePolicy(policy));
  const tasks = new Map<string, TaskState>();
  const listeners = new Set<HandoverListener>();

  function snapshot(task: TaskState): AutonomyContext {
    return {
      taskId: task.taskId,
      currentLevel: task.currentLevel,
      signals: cloneSignals(task.signals),
      history: [...task.history],
      startedAt: task.startedAt,
      lastUpdatedAt: task.lastUpdatedAt
    };
  }

  function requireTask(taskId: string): TaskState {
    const task = tasks.get(taskId);
    if (!task) {
      throw new Error(`yieldpoint: unknown task '${taskId}'. Call createTask() first, or enable autoCreate.`);
    }
    return task;
  }

  function fireListeners(event: HandoverEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function createHandoverEvent(
    task: TaskState,
    from: AutonomyLevel,
    to: AutonomyLevel,
    reason: HandoverReason,
    signalSnapshot: Signals
  ): HandoverEvent {
    return freezeEvent({
      id: createId(),
      taskId: task.taskId,
      timestamp: now(),
      from,
      to,
      reason,
      signalSnapshot,
      policyName: policy.name
    });
  }

  function findMatchingRule(task: TaskState, elapsedMs: number, signals: Signals): NormalizedRule | null {
    const ctx: TriggerContext = {
      taskId: task.taskId,
      currentLevel: task.currentLevel,
      signals,
      elapsedMs,
      history: task.history
    };
    for (const rule of normalized) {
      if (rule.from !== 'any' && !rule.from.includes(task.currentLevel)) continue;
      if (matchesAll(rule.when, ctx)) return rule;
    }
    return null;
  }

  function evaluateUpdate(task: TaskState, incoming: Signals, elapsedMs: number): UpdateResult {
    const previousLevel = task.currentLevel;

    const merged: Signals = { ...task.signals, ...incoming, elapsedMs };
    if (validate) validateSignals(merged);

    const rule = findMatchingRule(task, elapsedMs, merged);

    let event: HandoverEvent | null = null;
    let changed = false;

    if (rule && rule.to !== previousLevel) {
      const reason: HandoverReason = {
        kind: 'trigger',
        description: `rule '${rule.id}' matched ${rule.when.length} trigger(s)`,
        trigger: rule.when[0],
        ruleId: rule.id
      };
      event = createHandoverEvent(task, previousLevel, rule.to, reason, merged);
      task.history.push(event);
      if (task.history.length > maxHistory) {
        task.history.splice(0, task.history.length - maxHistory);
      }
      task.currentLevel = rule.to;
      changed = true;
      fireListeners(event);
    }

    task.signals = { ...merged };
    task.signals.humanRequest = false;
    task.lastUpdatedAt = now();

    return {
      taskId: task.taskId,
      previousLevel,
      currentLevel: task.currentLevel,
      changed,
      event,
      appliedSignals: cloneSignals(merged),
      elapsedMs,
      matchedRuleId: rule?.id
    };
  }

  const engine: HandoverEngine = {
    getPolicy() {
      return policy;
    },

    createTask(taskId: string, initialLevel?: AutonomyLevel) {
      const level = initialLevel ?? policy.initialLevel;
      if (!isAutonomyLevel(level)) {
        throw new TypeError(`initialLevel must be a valid AutonomyLevel, got ${String(level)}`);
      }
      if (tasks.has(taskId)) {
        throw new Error(`yieldpoint: task '${taskId}' already exists`);
      }
      const timestamp = now();
      const task: TaskState = {
        taskId,
        currentLevel: level,
        signals: {},
        history: [],
        startedAt: timestamp,
        lastUpdatedAt: timestamp,
        initialLevel: level
      };
      tasks.set(taskId, task);
      return snapshot(task);
    },

    hasTask(taskId: string) {
      return tasks.has(taskId);
    },

    getContext(taskId: string) {
      return snapshot(requireTask(taskId));
    },

    update(taskId: string, signals: Signals = {}) {
      let task = tasks.get(taskId);
      if (!task) {
        if (!autoCreate) throw new Error(`yieldpoint: unknown task '${taskId}'. Call createTask() first, or enable autoCreate.`);
        engine.createTask(taskId);
        task = requireTask(taskId);
      }
      const elapsedMs = typeof signals.elapsedMs === 'number' ? signals.elapsedMs : now() - task.startedAt;
      return evaluateUpdate(task, signals, elapsedMs);
    },

    tick(taskId: string) {
      let task = tasks.get(taskId);
      if (!task) {
        if (!autoCreate) throw new Error(`yieldpoint: unknown task '${taskId}'. Call createTask() first, or enable autoCreate.`);
        engine.createTask(taskId);
        task = requireTask(taskId);
      }
      return evaluateUpdate(task, {}, now() - task.startedAt);
    },

    transfer(taskId: string, to: AutonomyLevel, reason = 'Manual handover') {
      const task = requireTask(taskId);
      if (!isAutonomyLevel(to)) {
        throw new TypeError(`transfer target must be a valid AutonomyLevel, got ${String(to)}`);
      }
      if (to === task.currentLevel) return null;
      const from = task.currentLevel;
      const event = createHandoverEvent(
        task,
        from,
        to,
        { kind: 'manual', description: reason },
        cloneSignals(task.signals)
      );
      task.history.push(event);
      if (task.history.length > maxHistory) {
        task.history.splice(0, task.history.length - maxHistory);
      }
      task.currentLevel = to;
      task.lastUpdatedAt = now();
      fireListeners(event);
      return event;
    },

    requestHuman(taskId: string) {
      return engine.update(taskId, { humanRequest: true });
    },

    reset(taskId: string, initialLevel?: AutonomyLevel) {
      const task = requireTask(taskId);
      const level = initialLevel ?? task.initialLevel;
      if (!isAutonomyLevel(level)) {
        throw new TypeError(`initialLevel must be a valid AutonomyLevel, got ${String(level)}`);
      }
      const from = task.currentLevel;
      task.history = [];
      task.currentLevel = level;
      task.signals = {};
      const timestamp = now();
      task.startedAt = timestamp;
      task.lastUpdatedAt = timestamp;
      const event = createHandoverEvent(
        task,
        from,
        level,
        { kind: 'policy', description: 'Task reset' },
        {}
      );
      task.history.push(event);
      fireListeners(event);
    },

    removeTask(taskId: string) {
      tasks.delete(taskId);
    },

    history(taskId: string) {
      const task = requireTask(taskId);
      return [...task.history];
    },

    subscribe(listener: HandoverListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };

  return engine;
}

/** Compares two levels by autonomy score (used by adapters and simulations). */
export function compareAutonomy(a: AutonomyLevel, b: AutonomyLevel): number {
  return autonomyScore(a) - autonomyScore(b);
}
