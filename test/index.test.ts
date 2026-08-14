import { describe, expect, it } from 'vitest';
import * as core from '../src/index';
import * as langgraph from '../src/adapters/langgraph';
import * as openaiAgents from '../src/adapters/openai-agents';
import * as vercelAISdk from '../src/adapters/vercel-ai-sdk';
import * as agentLoop from '../src/adapters/agent-loop';

describe('public API surface', () => {
  it('exports core primitives', () => {
    expect(core.AUTONOMY_LEVELS).toBeInstanceOf(Array);
    expect(core.AUTONOMY_SCORES).toBeInstanceOf(Object);
    expect(core.HUMAN_IN_THE_LOOP_LEVELS).toBeInstanceOf(Array);
    expect(core.HUMAN_EXECUTED_LEVELS).toBeInstanceOf(Array);
    expect(core.autonomyScore).toBeTypeOf('function');
    expect(core.isAutonomyLevel).toBeTypeOf('function');
    expect(core.isHumanInTheLoop).toBeTypeOf('function');
    expect(core.isHumanExecuted).toBeTypeOf('function');
  });

  it('exports signal validation', () => {
    expect(core.validateSignals).toBeTypeOf('function');
  });

  it('exports trigger helpers', () => {
    expect(core.matchesTrigger).toBeTypeOf('function');
    expect(core.matchesAll).toBeTypeOf('function');
    expect(core.validateTrigger).toBeTypeOf('function');
  });

  it('exports event helpers', () => {
    expect(core.freezeEvent).toBeTypeOf('function');
  });

  it('exports policy helpers', () => {
    expect(core.normalizePolicy).toBeTypeOf('function');
    expect(core.validatePolicy).toBeTypeOf('function');
    expect(core.sortRulesByPriority).toBeTypeOf('function');
  });

  it('exports the engine factory', () => {
    expect(core.createHandoverEngine).toBeTypeOf('function');
    expect(core.compareAutonomy).toBeTypeOf('function');
  });

  it('exports the simulation module', () => {
    expect(core.runSimulation).toBeTypeOf('function');
    expect(core.simulateScenario).toBeTypeOf('function');
    expect(core.formatReport).toBeTypeOf('function');
  });

  it('exposes runtime constants', () => {
    expect(core.AUTONOMY_LEVELS).toContain('machine-only');
    expect(core.AUTONOMY_SCORES['machine-only']).toBe(5);
  });
});

describe('adapter entry points', () => {
  it('langgraph adapter exports its factory', () => {
    expect(langgraph.createLangGraphAdapter).toBeTypeOf('function');
  });

  it('openai-agents adapter exports its factory', () => {
    expect(openaiAgents.createOpenAIAgentsAdapter).toBeTypeOf('function');
  });

  it('vercel-ai-sdk adapter exports its factory and errors', () => {
    expect(vercelAISdk.createVercelAISDKAdapter).toBeTypeOf('function');
    expect(vercelAISdk.ApprovalRequiredError).toBeTypeOf('function');
    expect(vercelAISdk.ToolBlockedError).toBeTypeOf('function');
  });

  it('agent-loop adapter exports runAgentLoop', () => {
    expect(agentLoop.runAgentLoop).toBeTypeOf('function');
  });
});
