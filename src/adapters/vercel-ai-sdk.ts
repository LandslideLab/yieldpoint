import type { HandoverEngine } from '../engine';
import { autonomyScore, type AutonomyLevel } from '../levels';

/** Thrown when a gated tool is blocked because the current level must not act. */
export class ToolBlockedError extends Error {
  constructor(
    message: string,
    readonly level: AutonomyLevel
  ) {
    super(message);
    this.name = 'ToolBlockedError';
  }
}

/** Thrown when a gated tool requires human approval first. */
export class ApprovalRequiredError extends ToolBlockedError {
  constructor(
    override readonly level: AutonomyLevel,
    message = 'This tool requires human approval at the current autonomy level'
  ) {
    super(message, level);
    this.name = 'ApprovalRequiredError';
  }
}

/**
 * A minimal, duck-typed shape compatible with Vercel AI SDK `tool()`
 * definitions. The adapter never imports the `ai` package; pass the wrapped
 * object wherever the SDK accepts a tool definition.
 */
export interface AISDKToolLike {
  description?: string;
  parameters?: unknown;
  inputSchema?: unknown;
  execute?: (...args: unknown[]) => Promise<unknown> | unknown;
}

/** Options for {@link createVercelAISDKAdapter}. */
export interface VercelAISDKAdapterOptions {
  engine: HandoverEngine;
  taskId: string;
  /** Levels that may execute a gated tool directly. Defaults to `['observer', 'machine-only']`. */
  allowLevels?: AutonomyLevel[];
  /** Levels that are always blocked from executing. Defaults to human-executed levels. */
  denyLevels?: AutonomyLevel[];
  /** When the level requires approval, the adapter throws unless this is set. */
  onBlocked?: (ctx: { level: AutonomyLevel; reason: 'denied' | 'approval-required' }) => unknown;
}

/** A Vercel AI SDK integration adapter. */
export interface VercelAISDKAdapter {
  /** The current autonomy level for the configured task. */
  level(): AutonomyLevel;
  /** Whether tools may execute at the current level. */
  canAct(): boolean;
  /** Whether the current level requires human approval before acting. */
  requiresApproval(): boolean;
  /** Wrap a tool so execution is gated by the current autonomy level. */
  gateTool<T extends AISDKToolLike>(tool: T): T & { execute: AISDKToolLike['execute'] };
}

const DEFAULT_ALLOW_LEVELS: AutonomyLevel[] = ['observer', 'machine-only'];
const DEFAULT_DENY_LEVELS: AutonomyLevel[] = ['operator', 'collaborator'];

/**
 * Creates a Vercel AI SDK adapter that gates tool execution on the current
 * autonomy level. Duck-typed against the `ai` package's tool shape.
 */
export function createVercelAISDKAdapter(options: VercelAISDKAdapterOptions): VercelAISDKAdapter {
  const engine = options.engine;
  const taskId = options.taskId;
  const allowLevels = options.allowLevels ?? DEFAULT_ALLOW_LEVELS;
  const denyLevels = options.denyLevels ?? DEFAULT_DENY_LEVELS;
  const onBlocked = options.onBlocked;

  function currentLevel(): AutonomyLevel {
    return engine.getContext(taskId).currentLevel;
  }

  function requiresApprovalFor(level: AutonomyLevel): boolean {
    return level === 'approver';
  }

  function canActAt(level: AutonomyLevel): boolean {
    if (denyLevels.includes(level)) return false;
    if (requiresApprovalFor(level)) return false;
    if (allowLevels.includes(level)) return true;
    return autonomyScore(level) >= 2;
  }

  const adapter: VercelAISDKAdapter = {
    level: currentLevel,

    canAct(): boolean {
      return canActAt(currentLevel());
    },

    requiresApproval(): boolean {
      return requiresApprovalFor(currentLevel());
    },

    gateTool<T extends AISDKToolLike>(tool: T): T & { execute: AISDKToolLike['execute'] } {
      const original = tool.execute;
      const execute = async (...args: unknown[]): Promise<unknown> => {
        const level = currentLevel();
        if (requiresApprovalFor(level)) {
          if (onBlocked) return onBlocked({ level, reason: 'approval-required' });
          throw new ApprovalRequiredError(level);
        }
        if (!canActAt(level)) {
          if (onBlocked) return onBlocked({ level, reason: 'denied' });
          throw new ToolBlockedError(
            `Tool execution is blocked at autonomy level '${level}'`,
            level
          );
        }
        if (typeof original === 'function') {
          return original(...args);
        }
        return undefined;
      };
      return { ...tool, execute: execute as T['execute'] };
    }
  };

  return adapter;
}
