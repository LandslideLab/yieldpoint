import type { HandoverEngine } from '../engine';
import type { HandoverEvent } from '../events';
import { isHumanInTheLoop, type AutonomyLevel } from '../levels';
import type { Signals } from '../signals';

/**
 * A minimal, duck-typed shape compatible with the OpenAI Agents SDK tool
 * definitions. The adapter never imports `openai-agents`; pass the object
 * returned by {@link OpenAIAgentsAdapter.handoffTool} wherever the SDK accepts
 * a tool definition.
 */
export interface OpenAIAgentsToolLike {
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  run?: (args: Record<string, unknown>) => unknown;
  execute?: (args: Record<string, unknown>) => unknown;
}

/** Options for {@link createOpenAIAgentsAdapter}. */
export interface OpenAIAgentsAdapterOptions {
  engine: HandoverEngine;
  taskId: string;
  /** Name of the human agent to hand off to. Defaults to `'human_agent'`. */
  humanAgentName?: string;
  /**
   * Levels that should always hand off to the human agent immediately.
   * Defaults to human-executed levels (`operator`, `collaborator`).
   */
  forceHandoffLevels?: AutonomyLevel[];
}

/** The decision produced when an agent considers handing off to a human. */
export interface HandoffDecision {
  shouldHandoff: boolean;
  target: string;
  payload: Record<string, unknown>;
}

/** A dynamic-handoff integration for the OpenAI Agents SDK. */
export interface OpenAIAgentsAdapter {
  humanAgentName: string;
  /** Decide whether the agent should hand off to the human given fresh signals. */
  shouldHandoff(signals?: Signals): HandoffDecision;
  /**
   * Build an OpenAI Agents SDK-compatible tool whose execution returns a
   * handoff payload when the current autonomy level requires a human.
   */
  handoffTool(def?: Partial<OpenAIAgentsToolLike>): OpenAIAgentsToolLike;
  /** Record a human response by transferring control back to a level. */
  approve(to: AutonomyLevel, reason?: string): HandoverEvent | null;
}

const DEFAULT_FORCE_LEVELS: AutonomyLevel[] = ['operator', 'collaborator'];

/**
 * Creates an OpenAI Agents SDK adapter for dynamic handoffs.
 *
 * The returned tool is duck-typed against the SDK's tool shape; wire the
 * handoff payload into your SDK's handoff mechanism (e.g. return a handoff
 * instruction from a dynamic handoff tool).
 */
export function createOpenAIAgentsAdapter(options: OpenAIAgentsAdapterOptions): OpenAIAgentsAdapter {
  const engine = options.engine;
  const taskId = options.taskId;
  const humanAgentName = options.humanAgentName ?? 'human_agent';
  const forceLevels = options.forceHandoffLevels ?? DEFAULT_FORCE_LEVELS;

  function decide(signals: Signals | undefined, mutate: boolean): HandoffDecision {
    if (mutate && signals) {
      engine.update(taskId, signals);
    }
    const level = engine.getContext(taskId).currentLevel;
    const force = forceLevels.includes(level) || isHumanInTheLoop(level);
    const target = humanAgentName;
    return {
      shouldHandoff: force,
      target,
      payload: {
        type: 'yieldpoint:handoff',
        target,
        taskId,
        level,
        from: level,
        timestamp: Date.now()
      }
    };
  }

  const adapter: OpenAIAgentsAdapter = {
    humanAgentName,

    shouldHandoff(signals?: Signals): HandoffDecision {
      return decide(signals, Boolean(signals));
    },

    handoffTool(def: Partial<OpenAIAgentsToolLike> = {}): OpenAIAgentsToolLike {
      const run = async (args: Record<string, unknown>): Promise<unknown> => {
        const decision = decide(args as Signals, true);
        if (decision.shouldHandoff) {
          return { handoff: decision.payload };
        }
        return { continue: true, args };
      };
      return {
        name: def.name ?? 'yieldpoint_handoff',
        description: def.description ?? 'Yield control to the human agent when the policy requires it.',
        parameters: def.parameters ?? {
          type: 'object',
          properties: { confidence: { type: 'number' }, risk: { type: 'number' } }
        },
        run: def.run ?? run,
        execute: def.execute
      };
    },

    approve(to: AutonomyLevel, reason?: string): HandoverEvent | null {
      return engine.transfer(taskId, to, reason ?? 'Human approved handoff');
    }
  };

  return adapter;
}
