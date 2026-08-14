import { describe, expect, it } from 'vitest';
import { createHandoverEngine } from '../../src/engine';
import { createOpenAIAgentsAdapter } from '../../src/adapters/openai-agents';
import type { HandoverPolicy } from '../../src/policy';

function setup() {
  const policy: HandoverPolicy = {
    name: 'oa',
    initialLevel: 'machine-only',
    rules: [
      { id: 'low-conf', when: [{ type: 'confidence', below: 0.6 }], to: 'approver' },
      { id: 'human-req', when: [{ type: 'human-request' }], to: 'operator' }
    ]
  };
  const engine = createHandoverEngine(policy);
  engine.createTask('agent-task');
  const adapter = createOpenAIAgentsAdapter({ engine, taskId: 'agent-task', humanAgentName: 'doctor' });
  return { engine, adapter };
}

describe('createOpenAIAgentsAdapter', () => {
  it('does not hand off at a fully autonomous level', () => {
    const { adapter } = setup();
    const decision = adapter.shouldHandoff();
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.target).toBe('doctor');
  });

  it('hand offs when fresh signals move control to a human level', () => {
    const { adapter } = setup();
    const decision = adapter.shouldHandoff({ confidence: 0.3 });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.payload.level).toBe('approver');
    expect(decision.payload.type).toBe('yieldpoint:handoff');
  });

  it('hand offs when control is forced to a human level', () => {
    const { engine, adapter } = setup();
    engine.requestHuman('agent-task');
    expect(adapter.shouldHandoff().shouldHandoff).toBe(true);
  });

  it('handoffTool run returns a handoff payload at human levels', async () => {
    const { adapter } = setup();
    const tool = adapter.handoffTool();
    const out = await tool.run!({ confidence: 0.2 });
    expect(out).toHaveProperty('handoff');
    expect((out as { handoff: { level: string } }).handoff.level).toBe('approver');
  });

  it('handoffTool run continues at autonomous levels', async () => {
    const { adapter } = setup();
    const tool = adapter.handoffTool();
    const out = await tool.run!({ confidence: 0.9 });
    expect(out).toEqual({ continue: true, args: { confidence: 0.9 } });
  });

  it('handoffTool honours name and description overrides', () => {
    const { adapter } = setup();
    const tool = adapter.handoffTool({ name: 'yield', description: 'desc' });
    expect(tool.name).toBe('yield');
    expect(tool.description).toBe('desc');
    expect(tool.parameters).toEqual({
      type: 'object',
      properties: { confidence: { type: 'number' }, risk: { type: 'number' } }
    });
  });

  it('preserves a custom run implementation', async () => {
    const { adapter } = setup();
    const tool = adapter.handoffTool({ run: async () => 'custom' });
    expect(await tool.run!({})).toBe('custom');
  });

  it('approve records a manual handover', () => {
    const { engine, adapter } = setup();
    engine.update('agent-task', { confidence: 0.3 });
    const event = adapter.approve('machine-only', 'Doctor said go');
    expect(event).not.toBeNull();
    expect(event!.to).toBe('machine-only');
    expect(engine.getContext('agent-task').currentLevel).toBe('machine-only');
  });
});
