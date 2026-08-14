import type { HandoverEngine, UpdateResult } from '../engine';
import type { HandoverEvent } from '../events';
import { isHumanInTheLoop, type AutonomyLevel } from '../levels';
import type { Signals } from '../signals';

/** Input handed to the machine step runner. */
export interface AgentStepInput {
  level: AutonomyLevel;
  signals: Signals;
  attempt: number;
  output?: unknown;
}

/** Result of a single machine step. */
export interface AgentStepResult {
  output?: unknown;
  /** Set true to finish the loop successfully. */
  done?: boolean;
  /** Signals produced by this step; fed into the engine afterwards. */
  signals?: Signals;
}

/** Input handed to the human turn callback. */
export interface HumanTurnInput {
  level: AutonomyLevel;
  signals: Signals;
  event?: HandoverEvent;
}

/** Options for {@link runAgentLoop}. */
export interface AgentLoopOptions {
  engine: HandoverEngine;
  taskId: string;
  /** Executes one machine step at the current autonomy level. */
  runStep: (ctx: AgentStepInput) => AgentStepResult | Promise<AgentStepResult>;
  /**
   * Called whenever the current level requires a human in the loop.
   * Return the signals that should follow the human's intervention.
   * The loop fails with `human-unavailable` when this is omitted.
   */
  humanTurn?: (ctx: HumanTurnInput) => Signals | Promise<Signals>;
  /** Hard cap on loop iterations. Defaults to 100. */
  maxSteps?: number;
  /** Hard cap on consecutive human turns. Defaults to 10. */
  maxHumanTurns?: number;
  /** Called for every handover event. */
  onEvent?: (event: HandoverEvent) => void;
  /** Abort the loop cooperatively. */
  signal?: AbortSignal;
  /** Signals used for the very first engine update. */
  initialSignals?: Signals;
}

/** Result of a completed agent loop. */
export interface AgentLoopResult {
  taskId: string;
  finalLevel: AutonomyLevel;
  steps: number;
  humanTurns: number;
  output?: unknown;
  events: readonly HandoverEvent[];
  reason: 'done' | 'max-steps' | 'aborted' | 'human-unavailable' | 'human-loop-limit' | 'error';
  error?: unknown;
}

function requiresHumanTurn(level: AutonomyLevel): boolean {
  return isHumanInTheLoop(level);
}

/**
 * Runs a framework-agnostic agent loop that consults the handover engine
 * after every step, delegating to a human callback whenever the policy moves
 * control into a human-in-the-loop level.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    engine,
    taskId,
    runStep,
    humanTurn,
    maxSteps = 100,
    maxHumanTurns = 10,
    onEvent,
    signal,
    initialSignals
  } = options;

  if (!engine.hasTask(taskId)) {
    engine.createTask(taskId);
  }

  const unsubscribe =
    typeof onEvent === 'function'
      ? engine.subscribe((event) => {
          onEvent(event);
        })
      : null;

  let output: unknown;
  let steps = 0;
  let humanTurns = 0;
  let lastError: unknown;

  try {
    if (initialSignals) engine.update(taskId, initialSignals);

    while (steps < maxSteps) {
      if (signal?.aborted) {
        return finish('aborted');
      }

      const ctx = engine.getContext(taskId);

      if (requiresHumanTurn(ctx.currentLevel)) {
        if (!humanTurn) return finish('human-unavailable');
        if (humanTurns >= maxHumanTurns) return finish('human-loop-limit');

        const event = ctx.history[ctx.history.length - 1];
        const humanSignals = await humanTurn({
          level: ctx.currentLevel,
          signals: ctx.signals,
          event
        });
        humanTurns += 1;
        engine.update(taskId, humanSignals);
        continue;
      }

      const result = await runStep({
        level: ctx.currentLevel,
        signals: ctx.signals,
        attempt: 0,
        output
      });

      if (result.done) {
        if (result.signals) engine.update(taskId, result.signals);
        output = result.output ?? output;
        steps += 1;
        return finish('done');
      }

      output = result.output ?? output;
      const update: UpdateResult = engine.update(taskId, result.signals ?? {});
      void update;
      steps += 1;
    }

    return finish('max-steps');
  } catch (error) {
    lastError = error;
    return finish('error');
  } finally {
    unsubscribe?.();
  }

  function finish(reason: AgentLoopResult['reason']): AgentLoopResult {
    const ctx = engine.getContext(taskId);
    return {
      taskId,
      finalLevel: ctx.currentLevel,
      steps,
      humanTurns,
      output,
      events: [...ctx.history],
      reason,
      error: lastError
    };
  }
}
