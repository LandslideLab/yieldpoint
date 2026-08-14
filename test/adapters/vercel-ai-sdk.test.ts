import { describe, expect, it } from 'vitest';
import { createHandoverEngine } from '../../src/engine';
import {
  ApprovalRequiredError,
  ToolBlockedError,
  createVercelAISDKAdapter
} from '../../src/adapters/vercel-ai-sdk';
import type { HandoverPolicy } from '../../src/policy';

function setup() {
  const policy: HandoverPolicy = {
    initialLevel: 'machine-only',
    rules: [
      { id: 'low-conf', when: [{ type: 'confidence', below: 0.6 }], to: 'approver' },
      { id: 'human-req', when: [{ type: 'human-request' }], to: 'operator' }
    ]
  };
  const engine = createHandoverEngine(policy);
  engine.createTask('sdk-task');
  const adapter = createVercelAISDKAdapter({ engine, taskId: 'sdk-task' });
  return { engine, adapter };
}

const makeTool = (execute = async () => 'ok') => ({
  description: 'a tool',
  inputSchema: { type: 'object', properties: {} },
  execute
});

describe('createVercelAISDKAdapter', () => {
  it('reports the current level', () => {
    const { engine, adapter } = setup();
    expect(adapter.level()).toBe('machine-only');
    engine.update('sdk-task', { confidence: 0.3 });
    expect(adapter.level()).toBe('approver');
  });

  it('canAct is true for autonomous levels', () => {
    const { adapter } = setup();
    expect(adapter.canAct()).toBe(true);
    expect(adapter.requiresApproval()).toBe(false);
  });

  it('requiresApproval is true at the approver level', () => {
    const { engine, adapter } = setup();
    engine.update('sdk-task', { confidence: 0.3 });
    expect(adapter.requiresApproval()).toBe(true);
    expect(adapter.canAct()).toBe(false);
  });

  it('gateTool executes directly at an allowed level', async () => {
    const { adapter } = setup();
    const gated = adapter.gateTool(makeTool());
    expect(await gated.execute!()).toBe('ok');
  });

  it('gateTool throws ApprovalRequiredError at the approver level', async () => {
    const { engine, adapter } = setup();
    engine.update('sdk-task', { confidence: 0.3 });
    const gated = adapter.gateTool(makeTool());
    await expect(gated.execute!()).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it('gateTool throws ToolBlockedError at denied levels', async () => {
    const { engine, adapter } = setup();
    engine.requestHuman('sdk-task');
    const gated = adapter.gateTool(makeTool());
    await expect(gated.execute!()).rejects.toBeInstanceOf(ToolBlockedError);
  });

  it('gateTool calls onBlocked instead of throwing when configured', async () => {
    const { engine } = setup();
    const blocked: string[] = [];
    const adapter = createVercelAISDKAdapter({
      engine,
      taskId: 'sdk-task',
      onBlocked: (ctx) => {
        blocked.push(ctx.reason);
        return 'blocked';
      }
    });
    engine.requestHuman('sdk-task');
    const gated = adapter.gateTool(makeTool());
    expect(await gated.execute!()).toBe('blocked');
    expect(blocked).toContain('denied');
  });

  it('gateTool reports approval-required through onBlocked', async () => {
    const { engine } = setup();
    const reasons: string[] = [];
    const adapter = createVercelAISDKAdapter({
      engine,
      taskId: 'sdk-task',
      onBlocked: (ctx) => {
        reasons.push(ctx.reason);
        return null;
      }
    });
    engine.update('sdk-task', { confidence: 0.3 });
    const gated = adapter.gateTool(makeTool());
    await gated.execute!();
    expect(reasons).toContain('approval-required');
  });

  it('gateTool returns undefined when the tool has no execute', async () => {
    const { adapter } = setup();
    const gated = adapter.gateTool({ description: 'bare' });
    expect(await gated.execute!()).toBeUndefined();
  });

  it('honours custom allow and deny levels', () => {
    const { engine } = setup();
    const adapter = createVercelAISDKAdapter({
      engine,
      taskId: 'sdk-task',
      allowLevels: ['machine-only', 'observer'],
      denyLevels: ['operator']
    });
    engine.requestHuman('sdk-task');
    expect(adapter.canAct()).toBe(false);
    expect(adapter.requiresApproval()).toBe(false);
  });

  it('exposes typed error classes with level metadata', () => {
    const err = new ApprovalRequiredError('approver');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ToolBlockedError);
    expect(err.name).toBe('ApprovalRequiredError');
    expect(err.level).toBe('approver');
    const blocked = new ToolBlockedError('no', 'operator');
    expect(blocked.level).toBe('operator');
    expect(blocked.name).toBe('ToolBlockedError');
  });
});
