import { describe, expect, it } from 'vitest';
import { toClaudePermissionResult } from './claude.js';

describe('toClaudePermissionResult', () => {
  it('reconstructs the complete AskUserQuestion input for Claude', () => {
    const toolInput = {
      questions: [
        {
          question: 'Which option?',
          header: 'Option',
          options: [
            { label: 'One', description: 'First' },
            { label: 'Two', description: 'Second' },
          ],
          multiSelect: false,
        },
      ],
    };

    expect(
      toClaudePermissionResult('AskUserQuestion', toolInput, {
        behavior: 'answer',
        answers: { '0': ['One'] },
      }),
    ).toEqual({
      behavior: 'allow',
      updatedInput: {
        ...toolInput,
        answers: { 'Which option?': 'One' },
      },
    });
  });
});
