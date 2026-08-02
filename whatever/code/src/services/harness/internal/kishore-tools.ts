import { toolDefinition } from '@tanstack/ai';

interface AddSubArgs {
  a: number;
  b: number;
}

const numberPairSchema = {
  type: 'object',
  properties: {
    a: { type: 'number', description: 'The first number' },
    b: { type: 'number', description: 'The second number' },
  },
  required: ['a', 'b'],
};

const resultSchema = {
  type: 'object',
  properties: { result: { type: 'number' } },
  required: ['result'],
};

export const kishoreAddTool = toolDefinition({
  name: 'kishore-add',
  description: 'Add two numbers and return the sum.',
  inputSchema: numberPairSchema,
  outputSchema: resultSchema,
}).server((args: unknown) => {
  const { a, b } = args as AddSubArgs;
  return { result: a + b };
});

export const kishoreSubTool = toolDefinition({
  name: 'kishore-sub',
  description:
    'Subtract the second number from the first and return the result.',
  inputSchema: numberPairSchema,
  outputSchema: resultSchema,
}).server((args: unknown) => {
  const { a, b } = args as AddSubArgs;
  return { result: a - b };
});

export const kishoreTools = [kishoreAddTool, kishoreSubTool];
