import { describe, expect, it } from 'vitest';
import {
  AUTONOMY_LEVELS,
  AUTONOMY_SCORES,
  HUMAN_EXECUTED_LEVELS,
  HUMAN_IN_THE_LOOP_LEVELS,
  autonomyScore,
  isAutonomyLevel,
  isHumanExecuted,
  isHumanInTheLoop
} from '../src/levels';

describe('autonomy levels', () => {
  it('defines six levels in increasing autonomy order', () => {
    expect(AUTONOMY_LEVELS).toEqual([
      'operator',
      'collaborator',
      'consultant',
      'approver',
      'observer',
      'machine-only'
    ]);
  });

  it('assigns strictly increasing scores', () => {
    const scores = AUTONOMY_LEVELS.map((level) => autonomyScore(level));
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]! > scores[i - 1]!).toBe(true);
    }
    expect(autonomyScore('operator')).toBe(0);
    expect(autonomyScore('machine-only')).toBe(5);
  });

  it('maps every level to a numeric score', () => {
    for (const level of AUTONOMY_LEVELS) {
      expect(typeof AUTONOMY_SCORES[level]).toBe('number');
    }
  });

  it('isHumanInTheLoop covers the four participatory levels', () => {
    expect(HUMAN_IN_THE_LOOP_LEVELS).toEqual(['operator', 'collaborator', 'consultant', 'approver']);
    for (const level of HUMAN_IN_THE_LOOP_LEVELS) {
      expect(isHumanInTheLoop(level)).toBe(true);
    }
    expect(isHumanInTheLoop('observer')).toBe(false);
    expect(isHumanInTheLoop('machine-only')).toBe(false);
  });

  it('isHumanExecuted covers operator and collaborator', () => {
    expect(HUMAN_EXECUTED_LEVELS).toEqual(['operator', 'collaborator']);
    expect(isHumanExecuted('operator')).toBe(true);
    expect(isHumanExecuted('collaborator')).toBe(true);
    expect(isHumanExecuted('consultant')).toBe(false);
    expect(isHumanExecuted('machine-only')).toBe(false);
  });

  it('isAutonomyLevel guards arbitrary values', () => {
    expect(isAutonomyLevel('approver')).toBe(true);
    expect(isAutonomyLevel('machine-only')).toBe(true);
    expect(isAutonomyLevel('supreme')).toBe(false);
    expect(isAutonomyLevel(3)).toBe(false);
    expect(isAutonomyLevel(null)).toBe(false);
    expect(isAutonomyLevel(undefined)).toBe(false);
    expect(isAutonomyLevel({})).toBe(false);
  });
});
