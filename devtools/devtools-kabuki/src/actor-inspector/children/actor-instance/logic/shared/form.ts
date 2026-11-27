import type { Shape } from '../../../../logic/shared/index.ts';
import type { Built, Draft, FormField, Input, Problem } from './shape.ts';

const textOf = (shape: Shape): string => {
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

export const inputOf = (shape: Shape): Input => {
  switch (shape.kind) {
    case 'text':
      return { kind: 'text' };
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'switch' };
    case 'choice':
      return { kind: 'choice', options: shape.options };
    case 'struct':
      return {
        kind: 'group',
        fields: shape.fields.map((field) => ({
          name: field.name,
          ...(field.description === undefined
            ? {}
            : { description: field.description }),
          optional: field.optional,
          nullable: field.nullable,
          input: inputOf(field.shape),
        })),
      };
    case 'array':
    case 'json':
      return { kind: 'json', hint: textOf(shape) };
  }
};

export const draftOf = (input: Input): Draft => {
  switch (input.kind) {
    case 'switch':
      return false;
    case 'group':
      return Object.fromEntries(
        input.fields.map((field) => [field.name, draftOf(field.input)]),
      );
    default:
      return '';
  }
};

export const fieldDraft = (draft: Draft, field: FormField): Draft =>
  typeof draft === 'object'
    ? (draft[field.name] ?? draftOf(field.input))
    : draftOf(field.input);

const built = (value: unknown): Built => ({ _tag: 'Built', value });

const unbuilt = (path: string, problem: string): Built => ({
  _tag: 'Unbuilt',
  problems: [{ path, problem }],
});

const isBlank = (input: Input, draft: Draft) =>
  input.kind !== 'switch' && input.kind !== 'group' && draft === '';

const textIn = (draft: Draft) => (typeof draft === 'string' ? draft : '');

const valueAt = (input: Input, draft: Draft, path: string): Built => {
  switch (input.kind) {
    case 'text':
      return built(textIn(draft));
    case 'number': {
      const text = textIn(draft).trim();
      const value = Number(text);
      return text !== '' && Number.isFinite(value)
        ? built(value)
        : unbuilt(path, text === '' ? 'Write a number' : 'Not a number');
    }
    case 'switch':
      return built(draft === true);
    case 'choice': {
      const index = textIn(draft) === '' ? -1 : Number(draft);
      return index >= 0 && index < input.options.length
        ? built(input.options[index])
        : unbuilt(path, 'Pick one');
    }
    case 'json': {
      const text = textIn(draft);
      if (text.trim() === '') return unbuilt(path, 'Write JSON');
      try {
        return built(JSON.parse(text));
      } catch {
        return unbuilt(path, 'Not JSON');
      }
    }
    case 'group': {
      const value: Record<string, unknown> = {};
      const problems: Array<Problem> = [];
      for (const field of input.fields) {
        const at = path === '' ? field.name : `${path}.${field.name}`;
        const own = fieldDraft(draft, field);
        if (isBlank(field.input, own) && field.optional) continue;
        if (isBlank(field.input, own) && field.nullable) {
          value[field.name] = null;
          continue;
        }
        const one = valueAt(field.input, own, at);
        if (one._tag === 'Unbuilt') problems.push(...one.problems);
        else value[field.name] = one.value;
      }
      return problems.length > 0 ? { _tag: 'Unbuilt', problems } : built(value);
    }
  }
};

export const valueOf = (input: Input, draft: Draft): Built =>
  valueAt(input, draft, '');
