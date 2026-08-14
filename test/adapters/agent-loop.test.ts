import { describe, expect, it } from 'vitest';
import { createHandoverEngine } from '../../src/engine';
import { runAgentLoop } from '../../src/adapters/agent-loop';
import type { HandoverPolicy } from '../../src/policy';

function setup() {
  const policy: HandoverPolicy = {
    name: 'loop',
    initialLevel: 'machine-only',
    rules: [
      { id: 'human-req', when: [{ type: 'human-request' }], to: 'collaborator' },
      { id: 'recover', when: [{ type: 'confidence', above: 0.9 }], to: 'machine-only', from: ['collaborator'] }
    ]
  };
  const engine = createHandoverEngine(policy);
  return engine;
}

describe('runAgentLoop', () => {
  it('runs a fully autonomous loop to completion', async () => {
    const engine = setup();
    const result = await runAgentLoop({
      engine,
      taskId: 'auto',
      runStep: () => ({ output: { answer: 42 }, done: true, signals: { confidence: 0.95 } })
    });
    expect(result.reason).toBe('done');
    expect(result.output).toEqual({ answer: 42 });
    expect(result.steps).toBe(1);
    expect(result.humanTurns).toBe(0);
    expect(result.finalLevel).toBe('machine-only');
  });

  it('returns human-unavailable when a human is required without a callback', async () => {
    const engine = setup();
    engine.createTask('needs-human', 'collaborator');
    const result = await runAgentLoop({
      engine,
      taskId: 'needs-human',
      runStep: () => ({ done: true })
    });
    expect(result.reason).toBe('human-unavailable');
  });

  it('hands off to the human and resumes machine execution', async () => {
    const engine = setup();
    let machineRuns = 0;
    const result = await runAgentLoop({
      engine,
      taskId: 'mixed',
      initialSignals: { humanRequest: true, confidence: 0.5 },
      runStep: () => {
        machineRuns += 1;
        return { output: 'step', done: machineRuns >= 2, signals: { confidence: 0.95 } };
      },
      humanTurn: () => ({ confidence: 0.95, humanRequest: false })
    });
    expect(result.reason).toBe('done');
    expect(machineRuns).toBe(2);
    expect(result.humanTurns).toBe(1);
    expect(result.finalLevel).toBe('machine-only');
  });

  it('stops after maxSteps', async () => {
    const engine = setup();
    const result = await runAgentLoop({
      engine,
      taskId: 'loopy',
      runStep: () => ({ signals: {} }),
      maxSteps: 3
    });
    expect(result.reason).toBe('max-steps');
    expect(result.steps).toBe(3);
  });

  it('stops after too many consecutive human turns', async () => {
    const engine = setup();
    engine.createTask('stuck', 'collaborator');
    const result = await runAgentLoop({
      engine,
      taskId: 'stuck',
      runStep: () => ({ signals: {} }),
      humanTurn: () => ({}),
      maxHumanTurns: 2
    });
    expect(result.reason).toBe('human-loop-limit');
    expect(result.humanTurns).toBe(2);
  });

  it('aborts cooperatively via AbortSignal', async () => {
    const engine = setup();
    const controller = new AbortController();
    controller.abort();
    const result = await runAgentLoop({
      engine,
      taskId: 'abort',
      runStep: () => ({ signals: {} }),
      signal: controller.signal
    });
    expect(result.reason).toBe('aborted');
  });

  it('reports errors thrown by the machine step', async () => {
    const engine = setup();
    const result = await runAgentLoop({
      engine,
      taskId: 'boom',
      runStep: () => {
        throw new Error('machine exploded');
      }
    });
    expect(result.reason).toBe('error');
    expect((result.error as Error).message).toBe('machine exploded');
  });

  it('reports errors thrown by the human turn', async () => {
    const engine = setup();
    engine.createTask('human-boom', 'collaborator');
    const result = await runAgentLoop({
      engine,
      taskId: 'human-boom',
      runStep: () => ({ done: true }),
      humanTurn: () => {
        throw new Error('human failed');
      }
    });
    expect(result.reason).toBe('error');
    expect((result.error as Error).message).toBe('human failed');
  });

  it('emits every handover through onEvent', async () => {
    const engine = setup();
    const seen: string[] = [];
    await runAgentLoop({
      engine,
      taskId: 'events',
      initialSignals: { humanRequest: true, confidence: 0.5 },
      runStep: () => ({ done: true, signals: { confidence: 0.95 } }),
      humanTurn: () => ({ confidence: 0.95 }),
      onEvent: (event) => seen.push(event.reason.ruleId ?? '')
    });
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen).toContain('human-req');
  });

  it('creates the task automatically when missing', async () => {
    const engine = setup();
    const result = await runAgentLoop({
      engine,
      taskId: 'brand-new',
      runStep: () => ({ done: true })
    });
    expect(result.reason).toBe('done');
    expect(engine.hasTask('brand-new')).toBe(true);
  });
});
