import { describe, expect, it } from 'vitest';
import {
  normalizePolicy,
  sortRulesByPriority,
  validatePolicy,
  type HandoverPolicy
} from '../src/policy';

const validPolicy: HandoverPolicy = {
  name: 'test',
  initialLevel: 'observer',
  rules: [
    { id: 'low-conf', when: [{ type: 'confidence', below: 0.6 }], to: 'approver' },
    { when: [{ type: 'risk', above: 0.8 }], to: 'collaborator', priority: 5 }
  ]
};

describe('normalizePolicy', () => {
  it('assigns defaults for id, from, and priority', () => {
    const rules = normalizePolicy(validPolicy);
    expect(rules[0]!.id).toBe('low-conf');
    expect(rules[1]!.id).toBe('rule-1');
    expect(rules[0]!.from).toBe('any');
    expect(rules[0]!.priority).toBe(0);
    expect(rules[1]!.priority).toBe(5);
  });
});

describe('sortRulesByPriority', () => {
  it('sorts descending by priority, keeping stable order for ties', () => {
    const rules = normalizePolicy({
      initialLevel: 'observer',
      rules: [
        { id: 'a', when: [], to: 'observer', priority: 1 },
        { id: 'b', when: [], to: 'observer', priority: 5 },
        { id: 'c', when: [], to: 'observer', priority: 5 },
        { id: 'd', when: [], to: 'observer', priority: 0 }
      ]
    });
    const sorted = sortRulesByPriority(rules);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('does not mutate the input array', () => {
    const rules = normalizePolicy(validPolicy);
    const copy = [...rules];
    sortRulesByPriority(rules);
    expect(rules).toEqual(copy);
  });
});

describe('validatePolicy', () => {
  it('accepts a valid policy', () => {
    expect(() => validatePolicy(validPolicy)).not.toThrow();
  });

  it('rejects non-object policies', () => {
    expect(() => validatePolicy(null as never)).toThrow(TypeError);
    expect(() => validatePolicy([] as never)).toThrow(TypeError);
  });

  it('rejects an invalid initialLevel', () => {
    expect(() =>
      validatePolicy({ ...validPolicy, initialLevel: 'boss' as never })
    ).toThrow(TypeError);
  });

  it('rejects a non-array rules list', () => {
    expect(() => validatePolicy({ ...validPolicy, rules: 'x' as never })).toThrow(TypeError);
  });

  it('rejects non-object rules', () => {
    expect(() =>
      validatePolicy({ ...validPolicy, rules: [null as never] })
    ).toThrow(TypeError);
  });

  it('rejects rules with an invalid target level', () => {
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [{ when: [], to: 'boss' as never }]
      })
    ).toThrow(TypeError);
  });

  it('rejects rules with an invalid from list', () => {
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [{ when: [], to: 'approver', from: ['nope' as never] }]
      })
    ).toThrow(TypeError);
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [{ when: [], to: 'approver', from: 'observer' as never }]
      })
    ).toThrow(TypeError);
  });

  it('accepts a string from value', () => {
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [{ when: [{ type: 'human-request' }], to: 'approver', from: 'any' }]
      })
    ).not.toThrow();
  });

  it('rejects rules without triggers', () => {
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [{ to: 'approver', when: [] as never }]
      })
    ).toThrow(TypeError);
  });

  it('rejects duplicate rule ids', () => {
    expect(() =>
      validatePolicy({
        initialLevel: 'observer',
        rules: [
          { id: 'x', when: [{ type: 'human-request' }], to: 'approver' },
          { id: 'x', when: [{ type: 'human-request' }], to: 'approver' }
        ]
      })
    ).toThrow(TypeError);
  });
});
