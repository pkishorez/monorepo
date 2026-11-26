import type { Field, Shape } from '../../../rpc/session/contract/index.ts';

const field = ({ name, optional, nullable, shape }: Field) =>
  `${name}${optional ? '?' : ''}: ${signature(shape)}${nullable ? ' | null' : ''}`;

export const signature = (shape: Shape): string => {
  switch (shape.kind) {
    case 'text':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'choice':
      return shape.options.map((option) => JSON.stringify(option)).join(' | ');
    case 'json':
      return shape.text;
    case 'array': {
      const of = signature(shape.of);
      return of.includes(' | ') ? `(${of})[]` : `${of}[]`;
    }
    case 'struct':
      return shape.fields.length === 0
        ? '{}'
        : `{ ${shape.fields.map(field).join('; ')} }`;
  }
};

export const named = ({
  name,
  shape,
  description,
}: {
  readonly name: string;
  readonly shape: Shape;
  readonly description?: string;
}) =>
  `${name} ${signature(shape)}${description === undefined ? '' : `  // ${description}`}`;
