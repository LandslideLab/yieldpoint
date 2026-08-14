import { describe, expect, it } from 'vitest';
import { createHandoverEngine } from '../../src/engine';
import { createLangGraphAdapter } from '../../src/adapters/langgraph';
import type { HandoverPolicy } from '../../src/policy';

function setup() {
  const policy: HandoverPolicy = {
    name: 'lg',
    initialLevel: 'machine-only',
    rules: [{ id: 'low-conf', when: [{ type: 'confidence', below: 0.6 }], to: 'approver' }]
  };
  const engine = createHandoverEngine(policy);
  engine.createTask('graph-task');
  const adapter = createLangGraphAdapter({ engine, taskIdResolver: () => 'graph-task' });
  return { engine, adapter };
}

const state = { taskId: 'graph-task', messages: [] };

describe('createLangGraphAdapter', () => {
  it('decides to interrupt when control moves into a human level', () => {
    const { adapter } = setup();
    const decision = adapter.decide(state, { confidence: 0.3 });
    expect(decision.shouldInterrupt).toBe(true);
    expect(decision.level).toBe('approver');
    expect(decision.reason).toBe('level-requires-human');
    expect(decision.payload.taskId).toBe('graph-task');
    expect(decision.event).not.toBeNull();
  });

  it('does not interrupt when the level is fully autonomous', () => {
    const { adapter } = setup();
    const decision = adapter.decide(state, { confidence: 0.9 });
    expect(decision.shouldInterrupt).toBe(false);
    expect(decision.reason).toBe('none');
  });

  it('honours a custom interruptLevels list', () => {
    const policy: HandoverPolicy = {
      initialLevel: 'observer',
      rules: [{ when: [{ type: 'confidence', below: 0.6 }], to: 'observer' }]
    };
    const engine = createHandoverEngine(policy);
    engine.createTask('t');
    const adapter = createLangGraphAdapter({ engine, taskIdResolver: () => 't', interruptLevels: ['machine-only'] });
    const decision = adapter.decide({ taskId: 't' }, { confidence: 0.3 });
    expect(decision.shouldInterrupt).toBe(false);
  });

  it('interrupts when the current level is a human-in-the-loop level even if the rule no-ops', () => {
    const policy: HandoverPolicy = {
      initialLevel: 'approver',
      rules: [{ when: [{ type: 'confidence', below: 0.6 }], to: 'approver' }]
    };
    const engine = createHandoverEngine(policy);
    engine.createTask('t');
    const adapter = createLangGraphAdapter({ engine, taskIdResolver: () => 't' });
    const decision = adapter.decide({ taskId: 't' }, { confidence: 0.9 });
    expect(decision.shouldInterrupt).toBe(true);
  });

  it('inspect is read-only and reflects the stored level', () => {
    const { engine, adapter } = setup();
    engine.update('graph-task', { confidence: 0.3 });
    const before = engine.history('graph-task').length;
    const decision = adapter.inspect(state);
    expect(decision.level).toBe('approver');
    expect(decision.shouldInterrupt).toBe(true);
    expect(decision.event).toBeNull();
    expect(engine.history('graph-task').length).toBe(before);
  });

  it('throws when the task id cannot be resolved', () => {
    const policy: HandoverPolicy = { initialLevel: 'machine-only', rules: [] };
    const engine = createHandoverEngine(policy);
    engine.createTask('t');
    const adapter = createLangGraphAdapter({ engine, taskIdResolver: () => 42 as never });
    expect(() => adapter.decide({})).toThrow(/could not resolve/);
  });

  it('resume transfers control and returns a serializable payload', () => {
    const { adapter } = setup();
    adapter.decide(state, { confidence: 0.3 });
    const { resume, event } = adapter.resume('graph-task', { to: 'machine-only', response: { ok: true } });
    expect(event).not.toBeNull();
    expect(event!.to).toBe('machine-only');
    expect(resume.ok).toBe(true);
    expect(resume.level).toBe('machine-only');
    expect(resume.taskId).toBe('graph-task');
  });
});
