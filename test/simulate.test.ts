import { describe, expect, it } from 'vitest';
import { formatReport, runSimulation, simulateScenario, type Scenario } from '../src/simulate';
import type { HandoverPolicy } from '../src/policy';

const policy: HandoverPolicy = {
  name: 'sim-policy',
  initialLevel: 'machine-only',
  rules: [
    { id: 'low-conf', when: [{ type: 'confidence', below: 0.5 }], to: 'approver' },
    { id: 'high-risk', when: [{ type: 'risk', above: 0.8 }], to: 'operator', priority: 10 },
    { id: 'recover', when: [{ type: 'confidence', above: 0.9 }], to: 'machine-only', from: ['operator', 'collaborator'] }
  ]
};

const lowRiskStep = { signals: { confidence: 0.9, risk: 0.1 }, maxSafeLevel: 'machine-only' as const, quality: 0.95 };

describe('simulateScenario', () => {
  it('scores a fully autonomous successful run', () => {
    const scenario: Scenario = { name: 'auto', steps: [lowRiskStep, lowRiskStep] };
    const result = simulateScenario(policy, scenario);
    expect(result.metrics.quality).toBe(0.95);
    expect(result.metrics.safety).toBe(1);
    expect(result.metrics.autonomy).toBe(1);
    expect(result.metrics.cost).toBe(0);
    expect(result.summary.transfers).toBe(0);
  });

  it('detects an unsafe step above maxSafeLevel', () => {
    const scenario: Scenario = {
      name: 'unsafe',
      steps: [{ signals: { confidence: 0.9, risk: 0.2 }, maxSafeLevel: 'approver' }]
    };
    const result = simulateScenario(policy, scenario);
    expect(result.steps[0]!.safe).toBe(false);
    expect(result.metrics.safety).toBe(0);
    expect(result.summary.unsafeSteps).toBe(1);
  });

  it('treats steps without maxSafeLevel as safe', () => {
    const scenario: Scenario = {
      name: 'no-cap',
      steps: [{ signals: { confidence: 0.9 } }]
    };
    const result = simulateScenario(policy, scenario);
    expect(result.steps[0]!.safe).toBe(true);
    expect(result.metrics.safety).toBe(1);
  });

  it('credits quality 1 when a human executes the step', () => {
    const scenario: Scenario = {
      name: 'human',
      steps: [
        { signals: { risk: 0.9 }, maxSafeLevel: 'operator', quality: 0.7 },
        { signals: { confidence: 0.95, risk: 0.1 }, maxSafeLevel: 'machine-only', quality: 0.95 }
      ]
    };
    const result = simulateScenario(policy, scenario);
    // step 0 executed by human (operator): quality 1
    expect(result.steps[0]!.level).toBe('operator');
    expect(result.steps[0]!.quality).toBe(1);
    expect(result.steps[0]!.cost).toBeGreaterThan(0);
    // step 1 recovers to machine execution: quality 0.95
    expect(result.steps[1]!.level).toBe('machine-only');
    expect(result.steps[1]!.quality).toBe(0.95);
    expect(result.metrics.quality).toBeCloseTo((1 + 0.95) / 2, 5);
  });

  it('adds transfer cost when control moves toward the human', () => {
    const scenario: Scenario = {
      name: 'costs',
      steps: [{ signals: { risk: 0.9 }, maxSafeLevel: 'operator' }]
    };
    const result = simulateScenario(policy, scenario);
    // humanCost 1 + transferCost 0.5
    expect(result.metrics.cost).toBe(1.5);
    expect(result.summary.transfers).toBe(1);
    expect(result.events).toHaveLength(1);
  });

  it('honours custom cost weights', () => {
    const scenario: Scenario = {
      name: 'weights',
      steps: [{ signals: { risk: 0.9 }, maxSafeLevel: 'operator', humanCost: 3 }]
    };
    const result = simulateScenario(policy, scenario, { defaultHumanCost: 2, transferCost: 1 });
    expect(result.metrics.cost).toBe(4);
  });

  it('handles an empty scenario', () => {
    const result = simulateScenario(policy, { name: 'empty', steps: [] });
    expect(result.metrics).toEqual({ quality: 0, safety: 0, autonomy: 0, cost: 0 });
    expect(result.summary.steps).toBe(0);
  });

  it('assigns step ids by index', () => {
    const scenario: Scenario = { name: 'ids', steps: [lowRiskStep] };
    const result = simulateScenario(policy, scenario);
    expect(result.steps[0]!.stepId).toBe('step-0');
    const named: Scenario = { name: 'named', steps: [{ id: 'first', signals: {} }] };
    expect(simulateScenario(policy, named).steps[0]!.stepId).toBe('first');
  });
});

describe('runSimulation', () => {
  it('aggregates metrics and produces a safety rate', () => {
    const scenarios: Scenario[] = [
      { name: 'auto', steps: [lowRiskStep, lowRiskStep] },
      { name: 'human', steps: [{ signals: { risk: 0.9 }, maxSafeLevel: 'operator' }] }
    ];
    const report = runSimulation(policy, scenarios);
    expect(report.results).toHaveLength(2);
    expect(report.safetyRate).toBe(1);
    expect(report.aggregate.autonomy).toBeCloseTo((1 + 0) / 2, 5);
    expect(report.aggregate.cost).toBeGreaterThan(0);
    expect(report.summary.totalSteps).toBe(3);
    expect(report.summary.safeSteps).toBe(3);
    expect(report.summary.unsafeSteps).toBe(0);
    expect(report.summary.transfers).toBe(1);
    expect(report.summary.humanExecutedSteps).toBe(1);
    expect(report.summary.humanInTheLoopSteps).toBe(1);
  });

  it('tracks an unsafe scenario in the aggregate', () => {
    const scenarios: Scenario[] = [
      { name: 'auto', steps: [lowRiskStep] },
      { name: 'unsafe', steps: [{ signals: { confidence: 0.9 }, maxSafeLevel: 'approver' }] }
    ];
    const report = runSimulation(policy, scenarios);
    expect(report.safetyRate).toBeCloseTo(0.5, 5);
    expect(report.aggregate.safety).toBeCloseTo(0.5, 5);
    expect(report.summary.unsafeSteps).toBe(1);
  });

  it('respects scenario-level initialLevel overrides', () => {
    const scenarios: Scenario[] = [
      { name: 'starts-low', initialLevel: 'approver', steps: [{ signals: {} }] }
    ];
    const report = runSimulation(policy, scenarios);
    expect(report.results[0]!.steps[0]!.level).toBe('approver');
    expect(report.results[0]!.summary.transfers).toBe(0);
  });

  it('uses a deterministic clock when provided', () => {
    let t = 0;
    const scenarios: Scenario[] = [
      { name: 'clock', steps: [{ signals: {} }, { signals: {} }] }
    ];
    const report = runSimulation(policy, scenarios, { now: () => t });
    t = 5000;
    expect(report.results[0]!.steps[0]!.level).toBe('machine-only');
  });

  it('handles zero scenarios', () => {
    const report = runSimulation(policy, []);
    expect(report.results).toEqual([]);
    expect(report.safetyRate).toBe(0);
    expect(report.summary.scenarios).toBe(0);
  });
});

describe('formatReport', () => {
  it('renders a readable report', () => {
    const scenarios: Scenario[] = [
      { name: 'auto', steps: [lowRiskStep] },
      { name: 'human', steps: [{ signals: { risk: 0.9 }, maxSafeLevel: 'operator' }] }
    ];
    const report = runSimulation(policy, scenarios);
    const text = formatReport(report);
    expect(text).toContain('Scenario: auto');
    expect(text).toContain('Scenario: human');
    expect(text).toContain('--- Aggregate ---');
    expect(text).toContain('safetyRate=1');
  });
});
