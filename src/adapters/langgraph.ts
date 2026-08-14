import type { HandoverEngine } from '../engine';
import type { HandoverEvent } from '../events';
import { isHumanInTheLoop, type AutonomyLevel } from '../levels';
import type { Signals } from '../signals';

/** Options for {@link createLangGraphAdapter}. */
export interface LangGraphAdapterOptions {
  engine: HandoverEngine;
  /**
   * Levels that require a graph interrupt (a human turn).
   * Defaults to all human-in-the-loop levels.
   */
  interruptLevels?: AutonomyLevel[];
  /** Resolve a LangGraph state object to a task id. Defaults to `state.taskId`. */
  taskIdResolver?: (state: Record<string, unknown>) => string;
}

/** The decision returned by the LangGraph adapter. */
export interface InterruptDecision {
  shouldInterrupt: boolean;
  taskId: string;
  level: AutonomyLevel;
  reason: 'level-requires-human' | 'none';
  /**
   * A JSON-serializable payload safe to pass straight into LangGraph's
   * `interrupt(payload)` call.
   */
  payload: Record<string, unknown>;
  /** The handover event that triggered this decision, if any. */
  event: HandoverEvent | null;
}

/** A LangGraph.js integration adapter. */
export interface LangGraphAdapter {
  interruptLevels: readonly AutonomyLevel[];
  decide(state: Record<string, unknown>, signals?: Signals): InterruptDecision;
  inspect(state: Record<string, unknown>): InterruptDecision;
  resume(taskId: string, opts: { to: AutonomyLevel; response?: unknown; reason?: string }): {
    resume: Record<string, unknown>;
    event: HandoverEvent | null;
  };
}

const DEFAULT_INTERRUPT_LEVELS: AutonomyLevel[] = ['operator', 'collaborator', 'consultant', 'approver'];

/**
 * Creates a LangGraph.js adapter.
 *
 * This adapter is framework-agnostic: it never imports `@langchain/langgraph`.
 * Use the returned `payload` with your own `interrupt()` and `Command` imports,
 * or wire `decide()` into a node that calls `interrupt(decision.payload)`.
 */
export function createLangGraphAdapter(options: LangGraphAdapterOptions): LangGraphAdapter {
  const interruptLevels = options.interruptLevels ?? DEFAULT_INTERRUPT_LEVELS;
  const engine = options.engine;
  const taskIdResolver = options.taskIdResolver ?? ((state: Record<string, unknown>) => state.taskId as string);

  function resolveTaskId(state: Record<string, unknown>): string {
    const taskId = taskIdResolver(state);
    if (typeof taskId !== 'string' || taskId.length === 0) {
      throw new Error('yieldpoint: LangGraph adapter could not resolve a task id from graph state');
    }
    return taskId;
  }

  function payloadFor(taskId: string, level: AutonomyLevel, from: AutonomyLevel, event: HandoverEvent | null) {
    return {
      type: 'yieldpoint:handover',
      taskId,
      level,
      from,
      timestamp: event ? event.timestamp : Date.now(),
      eventId: event ? event.id : null
    };
  }

  const adapter: LangGraphAdapter = {
    interruptLevels,

    decide(state: Record<string, unknown>, signals?: Signals): InterruptDecision {
      const taskId = resolveTaskId(state);
      const update = engine.update(taskId, signals);
      const level = update.currentLevel;
      const requiresHuman = interruptLevels.includes(level) || isHumanInTheLoop(level);
      return {
        shouldInterrupt: requiresHuman,
        taskId,
        level,
        reason: requiresHuman ? 'level-requires-human' : 'none',
        payload: payloadFor(taskId, level, update.previousLevel, update.event),
        event: update.event
      };
    },

    inspect(state: Record<string, unknown>): InterruptDecision {
      const taskId = resolveTaskId(state);
      const ctx = engine.getContext(taskId);
      const level = ctx.currentLevel;
      const requiresHuman = interruptLevels.includes(level);
      return {
        shouldInterrupt: requiresHuman,
        taskId,
        level,
        reason: requiresHuman ? 'level-requires-human' : 'none',
        payload: payloadFor(taskId, level, level, null),
        event: null
      };
    },

    resume(taskId: string, opts: { to: AutonomyLevel; response?: unknown; reason?: string }) {
      const event = engine.transfer(taskId, opts.to, opts.reason);
      const response = (opts.response ?? {}) as Record<string, unknown>;
      return {
        resume: { ...response, taskId, level: opts.to, timestamp: Date.now() },
        event
      };
    }
  };

  return adapter;
}
