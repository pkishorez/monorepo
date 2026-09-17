import { describe, expect, it } from 'vitest';
import { aiTable } from './table.js';

describe('aiTable', () => {
  it('declares Thread, Run, and Message with five GSI slots', () => {
    expect(
      aiTable.registeredEntities.map((entity) => entity.name).sort(),
    ).toEqual(['AiMessage', 'AiRun', 'AiThread']);
    expect(Object.keys(aiTable.globalSecondaryIndexes)).toEqual([
      'GSI1',
      'GSI2',
      'GSI3',
      'GSI4',
      'GSI5',
    ]);
    const message = aiTable.registeredEntities.find(
      (entity) => entity.name === 'AiMessage',
    );
    expect(message?.kind).toBe('keyed');
    expect(message?.kind === 'keyed' ? message.primary.pk : []).toEqual([
      'runId',
    ]);
  });
});
