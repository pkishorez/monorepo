import type { Shape } from '../index.ts';

type Field = Extract<Shape, { readonly kind: 'struct' }>['fields'][number];

export const textOf = (shape: Shape): string => {
  switch (shape.kind) {
    case 'text':
      return 'string';
    case 'number':
    case 'boolean':
      return shape.kind;
    case 'choice':
      return shape.options.map((one) => JSON.stringify(one)).join(' | ');
    case 'array':
      return `${textOf(shape.of)}[]`;
    case 'struct':
      return shape.fields.length === 0
        ? '{}'
        : `{ ${shape.fields.map(({ name }) => name).join(', ')} }`;
    case 'json':
      return shape.text;
  }
};

export const fieldsOf = (shape: Shape | undefined): ReadonlyArray<Field> =>
  shape?.kind === 'struct' ? shape.fields : [];

export const schemaJson = (shape: Shape): unknown => {
  switch (shape.kind) {
    case 'array':
      return [schemaJson(shape.of)];
    case 'struct':
      return Object.fromEntries(
        shape.fields.map((field) => [
          `${field.name}${field.optional ? '?' : ''}${field.nullable ? ' | null' : ''}`,
          schemaJson(field.shape),
        ]),
      );
    default:
      return textOf(shape);
  }
};
