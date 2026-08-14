import { describe, expect, it } from 'vitest';
import { validateSignals } from '../src/signals';

describe('validateSignals', () => {
  it('accepts a valid signals object', () => {
    expect(() =>
      validateSignals({ confidence: 0.9, risk: 0.1, cost: 3, humanRequest: false, elapsedMs: 100 })
    ).not.toThrow();
  });

  it('accepts an empty object', () => {
    expect(() => validateSignals({})).not.toThrow();
  });

  it('rejects null, arrays, and non-objects', () => {
    expect(() => validateSignals(null as never)).toThrow(TypeError);
    expect(() => validateSignals([] as never)).toThrow(TypeError);
    expect(() => validateSignals('x' as never)).toThrow(TypeError);
  });

  it('rejects non-numeric confidence/risk/cost', () => {
    expect(() => validateSignals({ confidence: 'high' as never })).toThrow(TypeError);
    expect(() => validateSignals({ risk: 'high' as never })).toThrow(TypeError);
    expect(() => validateSignals({ cost: 'high' as never })).toThrow(TypeError);
    expect(() => validateSignals({ confidence: NaN })).toThrow(TypeError);
  });

  it('rejects confidence/risk outside [0, 1]', () => {
    expect(() => validateSignals({ confidence: -0.1 })).toThrow(TypeError);
    expect(() => validateSignals({ confidence: 1.2 })).toThrow(TypeError);
    expect(() => validateSignals({ risk: 1.5 })).toThrow(TypeError);
    expect(() => validateSignals({ risk: -1 })).toThrow(TypeError);
  });

  it('allows cost values outside [0, 1]', () => {
    expect(() => validateSignals({ cost: 42 })).not.toThrow();
  });

  it('rejects non-boolean humanRequest', () => {
    expect(() => validateSignals({ humanRequest: 'yes' as never })).toThrow(TypeError);
  });

  it('rejects non-numeric elapsedMs', () => {
    expect(() => validateSignals({ elapsedMs: 'soon' as never })).toThrow(TypeError);
  });

  it('accepts arbitrary extra keys', () => {
    expect(() => validateSignals({ weird: 'value', count: 7 })).not.toThrow();
  });
});
