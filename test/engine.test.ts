import { describe, expect, it } from 'vitest';
import { compareAutonomy, createHandoverEngine, type EngineOptions, type HandoverEngine } from '../src/engine';
import type { HandoverEvent } from '../src/events';
import type { AutonomyLevel } from '../src/levels';
import type { HandoverPolicy } from '../src/policy';

function makePolicy(): HandoverPolicy {
  return {
    name: 'test-policy',
    initialLevel: 'observer',
    rules: [
      { id: 'low-conf', when: [{ type: 'confidence', below: 0.6 }], to: 'approver', priority: 10 },
      { id: 'high-risk', when: [{ type: 'risk', above: 0.8 }], to: 'collaborator', priority: 20 },
      { id: 'human-request', when: [{ type: 'human-request' }], to: 'operator' },
      { id: 'recover', when: [{ type: 'confidence', above: 0.95 }], to: 'machine-only', from: ['approver'] },
      { id: 'timeout', when: [{ type: 'timeout', afterMs: 1000 }], to: 'consultant' }
    ]
  };
}

function makeEngine(overrides: Partial<HandoverPolicy> = {}, opts: EngineOptions = {}): HandoverEngine {
  return createHandoverEngine({ ...makePolicy(), ...overrides }, opts);
}

describe('createHandoverEngine', () => {
  it('rejects an invalid policy', () => {
    expect(() => createHandoverEngine({ initialLevel: 'nope' as never, rules: [] })).toThrow(TypeError);
  });

  it('returns the original policy via getPolicy', () => {
    const policy = makePolicy();
    const engine = makeEngine();
    expect(engine.getPolicy()).toEqual(policy);
  });
});

describe('task lifecycle', () => {
  it('creates a task at the policy initial level', () => {
    const engine = makeEngine();
    const ctx = engine.createTask('a');
    expect(ctx.taskId).toBe('a');
    expect(ctx.currentLevel).toBe('observer');
    expect(ctx.history).toEqual([]);
  });

  it('honours a custom initialLevel override', () => {
    const engine = makeEngine();
    const ctx = engine.createTask('a', 'machine-only');
    expect(ctx.currentLevel).toBe('machine-only');
  });

  it('rejects an invalid custom initialLevel', () => {
    const engine = makeEngine();
    expect(() => engine.createTask('a', 'boss' as never)).toThrow(TypeError);
  });

  it('rejects duplicate task creation', () => {
    const engine = makeEngine();
    engine.createTask('a');
    expect(() => engine.createTask('a')).toThrow(/already exists/);
  });

  it('hasTask reflects tracked tasks', () => {
    const engine = makeEngine();
    expect(engine.hasTask('a')).toBe(false);
    engine.createTask('a');
    expect(engine.hasTask('a')).toBe(true);
  });

  it('getContext returns an independent snapshot', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const ctx = engine.getContext('a');
    (ctx as { currentLevel: AutonomyLevel }).currentLevel = 'operator';
    ctx.signals.confidence = 0.1;
    (ctx as unknown as { history: HandoverEvent[] }).history.push({} as never);
    expect(engine.getContext('a').currentLevel).toBe('observer');
    expect(engine.getContext('a').signals).toEqual({});
    expect(engine.getContext('a').history).toEqual([]);
  });

  it('getContext throws for unknown tasks', () => {
    const engine = makeEngine();
    expect(() => engine.getContext('missing')).toThrow(/unknown task/);
  });

  it('removeTask stops tracking a task', () => {
    const engine = makeEngine();
    engine.createTask('a');
    engine.removeTask('a');
    expect(engine.hasTask('a')).toBe(false);
    expect(() => engine.getContext('a')).toThrow(/unknown task/);
  });
});

describe('update and rule matching', () => {
  it('downgrades control when confidence drops below threshold', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const result = engine.update('a', { confidence: 0.4 });
    expect(result.changed).toBe(true);
    expect(result.currentLevel).toBe('approver');
    expect(result.previousLevel).toBe('observer');
    expect(result.matchedRuleId).toBe('low-conf');
    expect(result.event).not.toBeNull();
  });

  it('respects rule priority over declaration order', () => {
    const engine = makeEngine();
    engine.createTask('a');
    // high-risk has priority 20 > low-conf priority 10
    const result = engine.update('a', { confidence: 0.3, risk: 0.9 });
    expect(result.matchedRuleId).toBe('high-risk');
    expect(result.currentLevel).toBe('collaborator');
  });

  it('does not change level when a rule targets the current level', () => {
    const engine = makeEngine();
    engine.createTask('a', 'approver');
    const result = engine.update('a', { confidence: 0.4 });
    expect(result.changed).toBe(false);
    expect(result.event).toBeNull();
    expect(result.matchedRuleId).toBe('low-conf');
    expect(result.currentLevel).toBe('approver');
  });

  it('respects the from filter', () => {
    const engine = makeEngine();
    engine.createTask('a', 'machine-only');
    // recover rule only applies from 'approver'
    const result = engine.update('a', { confidence: 0.99 });
    expect(result.changed).toBe(false);
    expect(result.event).toBeNull();
  });

  it('fires the from-filtered rule once at the right level', () => {
    const engine = makeEngine();
    engine.createTask('a', 'approver');
    const result = engine.update('a', { confidence: 0.99 });
    expect(result.changed).toBe(true);
    expect(result.currentLevel).toBe('machine-only');
    expect(result.matchedRuleId).toBe('recover');
  });

  it('fires on humanRequest', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const result = engine.requestHuman('a');
    expect(result.changed).toBe(true);
    expect(result.currentLevel).toBe('operator');
  });

  it('consumes the humanRequest flag after the first update', () => {
    const engine = makeEngine();
    engine.createTask('a');
    engine.update('a', { humanRequest: true });
    expect(engine.getContext('a').currentLevel).toBe('operator');
    // the one-shot flag is consumed, so a plain update no longer fires
    const second = engine.update('a', { confidence: 0.8 });
    expect(second.changed).toBe(false);
  });

  it('merges new signals over stored ones', () => {
    const engine = makeEngine();
    engine.createTask('a');
    engine.update('a', { confidence: 0.9, risk: 0.2 });
    const result = engine.update('a', { risk: 0.9 });
    expect(result.changed).toBe(true);
    expect(result.appliedSignals.confidence).toBe(0.9);
    expect(result.appliedSignals.risk).toBe(0.9);
  });

  it('exposes the computed elapsedMs in the result', () => {
    let now = 1000;
    const engine = makeEngine({}, { now: () => now });
    engine.createTask('a');
    now = 2500;
    const result = engine.update('a', {});
    expect(result.elapsedMs).toBe(1500);
  });

  it('lets a provided elapsedMs override the clock', () => {
    const now = 1000;
    const engine = makeEngine({}, { now: () => now });
    engine.createTask('a');
    const result = engine.update('a', { elapsedMs: 99999 });
    expect(result.elapsedMs).toBe(99999);
  });

  it('fires a timeout rule via tick()', () => {
    let now = 0;
    const engine = makeEngine({}, { now: () => now });
    engine.createTask('a');
    now = 2000;
    const result = engine.tick('a');
    expect(result.changed).toBe(true);
    expect(result.currentLevel).toBe('consultant');
    expect(result.matchedRuleId).toBe('timeout');
  });

  it('tick does not fire unrelated rules', () => {
    let now = 0;
    const engine = makeEngine({}, { now: () => now });
    engine.createTask('a');
    now = 500;
    const result = engine.tick('a');
    expect(result.changed).toBe(false);
  });

  it('throws for unknown tasks by default', () => {
    const engine = makeEngine();
    expect(() => engine.update('ghost', {})).toThrow(/unknown task/);
  });

  it('auto-creates tasks when autoCreate is enabled', () => {
    const engine = makeEngine({}, { autoCreate: true });
    const result = engine.update('ghost', { confidence: 0.4 });
    expect(result.taskId).toBe('ghost');
    expect(result.currentLevel).toBe('approver');
  });

  it('tick auto-creates tasks when autoCreate is enabled', () => {
    const engine = makeEngine({}, { autoCreate: true });
    const result = engine.tick('ghost');
    expect(result.currentLevel).toBe('observer');
  });
});

describe('signal validation', () => {
  it('throws on out-of-range signals by default', () => {
    const engine = makeEngine();
    engine.createTask('a');
    expect(() => engine.update('a', { confidence: 5 })).toThrow(TypeError);
  });

  it('skips validation when disabled', () => {
    const engine = makeEngine({}, { validateSignals: false });
    engine.createTask('a');
    expect(() => engine.update('a', { confidence: 5 })).not.toThrow();
  });
});

describe('handover events', () => {
  it('records a frozen event with full metadata', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const result = engine.update('a', { confidence: 0.4 });
    const event = result.event as HandoverEvent;
    expect(event).not.toBeNull();
    expect(event.taskId).toBe('a');
    expect(event.from).toBe('observer');
    expect(event.to).toBe('approver');
    expect(event.reason.kind).toBe('trigger');
    expect(event.reason.ruleId).toBe('low-conf');
    expect(event.reason.trigger).toEqual({ type: 'confidence', below: 0.6 });
    expect(event.signalSnapshot.confidence).toBe(0.4);
    expect(event.policyName).toBe('test-policy');
    expect(typeof event.id).toBe('string');
    expect(event.timestamp).toBeGreaterThan(0);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.reason)).toBe(true);
    expect(Object.isFrozen(event.signalSnapshot)).toBe(true);
  });

  it('uses a custom id generator when provided', () => {
    const engine = makeEngine({}, { createId: () => 'custom-id' });
    engine.createTask('a');
    const event = engine.update('a', { confidence: 0.4 }).event as HandoverEvent;
    expect(event.id).toBe('custom-id');
  });

  it('appends every event to history', () => {
    const engine = makeEngine();
    engine.createTask('a');
    engine.update('a', { confidence: 0.4 });
    engine.update('a', { confidence: 0.99 });
    const history = engine.history('a');
    expect(history).toHaveLength(2);
    expect(history[0]!.to).toBe('approver');
    expect(history[1]!.to).toBe('machine-only');
  });

  it('caps history at maxHistory', () => {
    const engine = makeEngine({}, { maxHistory: 2 });
    engine.createTask('a');
    engine.update('a', { confidence: 0.4 });
    engine.update('a', { confidence: 0.99 });
    engine.update('a', { confidence: 0.3 });
    const history = engine.history('a');
    expect(history).toHaveLength(2);
    expect(history[0]!.to).toBe('machine-only');
    expect(history[1]!.to).toBe('approver');
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const seen: HandoverEvent[] = [];
    const unsubscribe = engine.subscribe((event) => seen.push(event));
    engine.update('a', { confidence: 0.4 });
    expect(seen).toHaveLength(1);
    unsubscribe();
    engine.update('a', { confidence: 0.99 });
    expect(seen).toHaveLength(1);
  });
});

describe('manual transfer', () => {
  it('moves control and records a manual event', () => {
    const engine = makeEngine();
    engine.createTask('a');
    const event = engine.transfer('a', 'operator', 'Doctor took over');
    expect(event).not.toBeNull();
    expect(event!.from).toBe('observer');
    expect(event!.to).toBe('operator');
    expect(event!.reason.kind).toBe('manual');
    expect(event!.reason.description).toBe('Doctor took over');
    expect(engine.getContext('a').currentLevel).toBe('operator');
  });

  it('returns null when the target level is unchanged', () => {
    const engine = makeEngine();
    engine.createTask('a');
    expect(engine.transfer('a', 'observer')).toBeNull();
  });

  it('rejects an invalid target level', () => {
    const engine = makeEngine();
    engine.createTask('a');
    expect(() => engine.transfer('a', 'boss' as never)).toThrow(TypeError);
  });

  it('throws for unknown tasks', () => {
    const engine = makeEngine();
    expect(() => engine.transfer('ghost', 'operator')).toThrow(/unknown task/);
  });
});

describe('reset', () => {
  it('clears history and restores the task initial level', () => {
    const engine = makeEngine();
    engine.createTask('a', 'machine-only');
    engine.update('a', { confidence: 0.4 });
    engine.reset('a');
    const ctx = engine.getContext('a');
    expect(ctx.currentLevel).toBe('machine-only');
    expect(ctx.signals).toEqual({});
    expect(ctx.history).toHaveLength(1);
    expect(ctx.history[0]!.reason.kind).toBe('policy');
    expect(ctx.history[0]!.reason.description).toBe('Task reset');
    expect(ctx.history[0]!.from).toBe('approver');
    expect(ctx.history[0]!.to).toBe('machine-only');
  });

  it('honours an explicit reset level', () => {
    const engine = makeEngine();
    engine.createTask('a');
    engine.reset('a', 'consultant');
    expect(engine.getContext('a').currentLevel).toBe('consultant');
  });

  it('rejects an invalid reset level', () => {
    const engine = makeEngine();
    engine.createTask('a');
    expect(() => engine.reset('a', 'boss' as never)).toThrow(TypeError);
  });
});

describe('clock and ids', () => {
  it('uses a custom clock for timestamps and elapsed time', () => {
    let now = 100;
    const engine = makeEngine({}, { now: () => now });
    engine.createTask('a');
    now = 200;
    const event = engine.update('a', { confidence: 0.4 }).event as HandoverEvent;
    expect(event.timestamp).toBe(200);
  });

  it('created tasks use the initial clock', () => {
    const now = 100;
    const engine = makeEngine({}, { now: () => now });
    const ctx = engine.createTask('a');
    expect(ctx.startedAt).toBe(100);
  });
});

describe('compareAutonomy', () => {
  it('compares levels by score', () => {
    expect(compareAutonomy('operator', 'machine-only')).toBeLessThan(0);
    expect(compareAutonomy('machine-only', 'operator')).toBeGreaterThan(0);
    expect(compareAutonomy('approver', 'approver')).toBe(0);
  });
});
