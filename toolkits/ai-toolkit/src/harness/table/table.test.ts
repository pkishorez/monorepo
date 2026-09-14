import { describe, expect, it } from 'vitest';
import { aiTable } from './table.js';

describe('aiTable', () => {
  it('contains only Thread, Run, and completed Message entities', () => {
    expect(
      aiTable.registeredEntities.map((entity) => entity.name).sort(),
    ).toEqual(['AiMessage', 'AiRun', 'AiThread']);
    expect(Object.keys(aiTable.globalSecondaryIndexes)).toEqual(['GSI1']);
    const message = aiTable.registeredEntities.find(
      (entity) => entity.name === 'AiMessage',
    );
    expect(message?.kind).toBe('keyed');
    expect(message?.kind === 'keyed' ? message.primary.pk : []).toEqual([
      'runId',
    ]);
  });
});
