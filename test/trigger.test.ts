import { describe, expect, it } from 'vitest';
import { matchesAll, matchesTrigger, validateTrigger, type TransferTrigger, type TriggerContext } from '../src/trigger';

function ctx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    taskId: 't1',
    currentLevel: 'observer',
    signals: {},
    elapsedMs: 0,
    history: [],
    ...overrides
  };
}

describe('matchesTrigger', () => {
  it('confidence below fires when signal is below threshold', () => {
    const t: TransferTrigger = { type: 'confidence', below: 0.6 };
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.4 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.6 } }))).toBe(false);
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.8 } }))).toBe(false);
  });

  it('confidence above fires when signal is above threshold', () => {
    const t: TransferTrigger = { type: 'confidence', above: 0.9 };
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.95 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.9 } }))).toBe(false);
  });

  it('confidence with both thresholds uses an interval', () => {
    const t: TransferTrigger = { type: 'confidence', above: 0.2, below: 0.8 };
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.5 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.1 } }))).toBe(false);
    expect(matchesTrigger(t, ctx({ signals: { confidence: 0.9 } }))).toBe(false);
  });

  it('confidence with missing signal does not fire', () => {
    const t: TransferTrigger = { type: 'confidence', below: 0.6 };
    expect(matchesTrigger(t, ctx({ signals: {} }))).toBe(false);
  });

  it('risk above fires when risk exceeds threshold', () => {
    const t: TransferTrigger = { type: 'risk', above: 0.7 };
    expect(matchesTrigger(t, ctx({ signals: { risk: 0.8 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { risk: 0.5 } }))).toBe(false);
  });

  it('cost above fires when cost exceeds threshold', () => {
    const t: TransferTrigger = { type: 'cost', above: 10 };
    expect(matchesTrigger(t, ctx({ signals: { cost: 12 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { cost: 5 } }))).toBe(false);
  });

  it('cost below fires when cost is below threshold', () => {
    const t: TransferTrigger = { type: 'cost', below: 5 };
    expect(matchesTrigger(t, ctx({ signals: { cost: 2 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { cost: 7 } }))).toBe(false);
  });

  it('timeout fires once elapsed passes afterMs', () => {
    const t: TransferTrigger = { type: 'timeout', afterMs: 5000 };
    expect(matchesTrigger(t, ctx({ elapsedMs: 4999 }))).toBe(false);
    expect(matchesTrigger(t, ctx({ elapsedMs: 5000 }))).toBe(true);
    expect(matchesTrigger(t, ctx({ elapsedMs: 99999 }))).toBe(true);
  });

  it('human-request fires only when humanRequest is true', () => {
    const t: TransferTrigger = { type: 'human-request' };
    expect(matchesTrigger(t, ctx({ signals: { humanRequest: true } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { humanRequest: false } }))).toBe(false);
    expect(matchesTrigger(t, ctx({ signals: {} }))).toBe(false);
  });

  it('generic signal trigger reads arbitrary keys', () => {
    const t: TransferTrigger = { type: 'signal', name: 'urgency', above: 5 };
    expect(matchesTrigger(t, ctx({ signals: { urgency: 6 } }))).toBe(true);
    expect(matchesTrigger(t, ctx({ signals: { urgency: 3 } }))).toBe(false);
    expect(matchesTrigger(t, ctx({ signals: { urgency: 'high' } }))).toBe(false);
    expect(matchesTrigger(t, ctx({ signals: {} }))).toBe(false);
  });

  it('custom trigger delegates to the predicate', () => {
    const calls: number[] = [];
    const t: TransferTrigger = {
      type: 'custom',
      test: (c) => {
        calls.push(c.elapsedMs);
        return c.signals.confidence === 1;
      }
    };
    expect(matchesTrigger(t, ctx({ elapsedMs: 42, signals: { confidence: 1 } }))).toBe(true);
    expect(calls).toEqual([42]);
    expect(matchesTrigger(t, ctx({ elapsedMs: 43, signals: { confidence: 0 } }))).toBe(false);
  });

  it('unknown trigger types never fire', () => {
    const t = { type: 'explodes' } as unknown as TransferTrigger;
    expect(matchesTrigger(t, ctx())).toBe(false);
  });
});

describe('matchesAll', () => {
  it('requires every trigger to fire', () => {
    const triggers: TransferTrigger[] = [
      { type: 'confidence', below: 0.6 },
      { type: 'risk', above: 0.7 }
    ];
    expect(
      matchesAll(triggers, ctx({ signals: { confidence: 0.4, risk: 0.9 } }))
    ).toBe(true);
    expect(
      matchesAll(triggers, ctx({ signals: { confidence: 0.4, risk: 0.5 } }))
    ).toBe(false);
  });

  it('is true for an empty trigger list', () => {
    expect(matchesAll([], ctx())).toBe(true);
  });
});

describe('validateTrigger', () => {
  it('rejects non-object triggers', () => {
    expect(() => validateTrigger(null as never)).toThrow(TypeError);
  });

  it('rejects custom triggers without a test function', () => {
    expect(() => validateTrigger({ type: 'custom', test: 3 } as never)).toThrow(TypeError);
  });

  it('accepts custom triggers with a test function', () => {
    expect(() => validateTrigger({ type: 'custom', test: () => true })).not.toThrow();
  });

  it('rejects negative timeout afterMs', () => {
    expect(() => validateTrigger({ type: 'timeout', afterMs: -1 })).toThrow(TypeError);
    expect(() => validateTrigger({ type: 'timeout', afterMs: 'soon' as never })).toThrow(TypeError);
  });

  it('accepts zero and positive timeout afterMs', () => {
    expect(() => validateTrigger({ type: 'timeout', afterMs: 0 })).not.toThrow();
    expect(() => validateTrigger({ type: 'timeout', afterMs: 1000 })).not.toThrow();
  });

  it('accepts human-request triggers', () => {
    expect(() => validateTrigger({ type: 'human-request' })).not.toThrow();
  });

  it('rejects signal triggers without a name', () => {
    expect(() => validateTrigger({ type: 'signal', name: 4 } as never)).toThrow(TypeError);
  });

  it('rejects non-numeric thresholds', () => {
    expect(() => validateTrigger({ type: 'confidence', below: 'x' as never })).toThrow(TypeError);
    expect(() => validateTrigger({ type: 'risk', above: NaN })).toThrow(TypeError);
    expect(() => validateTrigger({ type: 'signal', name: 'a', below: 'y' as never })).toThrow(TypeError);
  });

  it('accepts valid threshold triggers', () => {
    expect(() => validateTrigger({ type: 'confidence', below: 0.6 })).not.toThrow();
    expect(() => validateTrigger({ type: 'risk', above: 0.7 })).not.toThrow();
    expect(() => validateTrigger({ type: 'cost', above: 10 })).not.toThrow();
    expect(() => validateTrigger({ type: 'signal', name: 'urgency', above: 5 })).not.toThrow();
  });
});
