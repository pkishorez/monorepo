import { Schema, SchemaAST } from 'effect';
import type { Blueprint, Runtime } from '@kestack/kabuki';
import type { AnyActor, From, Sent } from '@kestack/kabuki/types';

/*
 * A Control as the bubble offers it: a form per Message, read from the
 * Message's Schema in the Actor's Blueprint, and the Message the form
 * makes.
 *
 * 1. Offer   the Controls an Instance takes: the Fake's `controls` its
 *            Actor has an Update for, at its top or in any State, in the
 *            order the Fake lists them.
 * 2. Fields  one per field of the Message, by name, from its encoded side:
 *            text, a number, a switch, a choice of literals, else JSON;
 *            optional or nullable, a blank leaves it out or null.
 * 3. Make    the encoded Message from what the form holds, decoded by the
 *            Message's Schema: what is Sent, or why it cannot be.
 * 4. Send    it to the Instance's Address, from the bubble: its History
 *            entry says so, and what became of it is shown.
 */

/** One Control an Instance takes: its Message tag and Schema. */
export interface Control {
  readonly tag: string;
  readonly schema: Schema.Top;
}

/** What a field is filled with. */
export type Input =
  | { readonly kind: 'text' }
  | { readonly kind: 'number' }
  | { readonly kind: 'boolean' }
  | {
      readonly kind: 'choice';
      readonly options: ReadonlyArray<string | number | boolean>;
    }
  | { readonly kind: 'json' };

/** One field of a Control's form. */
export interface FormField {
  readonly name: string;
  /** Left out when blank. */
  readonly optional: boolean;
  /** Null when blank. */
  readonly nullable: boolean;
  readonly input: Input;
  /** The Schema's description, when it has one. */
  readonly description?: string;
}

// 1. Offer
/** The Controls an Actor takes, of the ones a Fake offers, in the Fake's order. */
export const controlsOf = (
  print: Blueprint,
  controls: ReadonlyArray<string>,
): ReadonlyArray<Control> => {
  const levels = [print.top, ...Object.values(print.state)];
  return controls.flatMap((tag) => {
    const schema = levels.find((level) => Object.hasOwn(level.on, tag))?.on[
      tag
    ];
    return schema ? [{ tag, schema }] : [];
  });
};

/** A Message tag in words: `AddSampleProject` as `Add sample project`. */
export const wordsOf = (tag: string): string => {
  const words = tag
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(' ');
  return words
    .map((word, index) =>
      index === 0 || /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase(),
    )
    .join(' ');
};

// 2. Fields
const unwrapped = (ast: SchemaAST.AST): SchemaAST.AST =>
  ast._tag === 'Suspend' ? unwrapped(ast.thunk()) : ast;

const inputOf = (
  ast: SchemaAST.AST,
): { readonly input: Input; readonly nullable: boolean } => {
  const here = unwrapped(ast);
  switch (here._tag) {
    case 'String':
    case 'TemplateLiteral':
      return { input: { kind: 'text' }, nullable: false };
    case 'Number':
      return { input: { kind: 'number' }, nullable: false };
    case 'Boolean':
      return { input: { kind: 'boolean' }, nullable: false };
    case 'Literal':
      return {
        input: {
          kind: 'choice',
          options: [here.literal as string | number | boolean],
        },
        nullable: false,
      };
    case 'Union': {
      const members = here.types
        .map(unwrapped)
        .filter((one) => one._tag !== 'Undefined' && one._tag !== 'Void');
      const nullable = members.some((one) => one._tag === 'Null');
      const rest = members.filter((one) => one._tag !== 'Null');
      if (rest.length > 0 && rest.every((one) => one._tag === 'Literal'))
        return {
          input: {
            kind: 'choice',
            options: rest.map(
              (one) =>
                (one as SchemaAST.Literal).literal as string | number | boolean,
            ),
          },
          nullable,
        };
      if (rest.length === 1) return { ...inputOf(rest[0]!), nullable };
      return { input: { kind: 'json' }, nullable };
    }
    default:
      return { input: { kind: 'json' }, nullable: false };
  }
};

const fieldsMade = new WeakMap<Schema.Top, ReadonlyArray<FormField>>();

/** The fields of a Control's form, read once per Schema. */
export const fieldsOf = (schema: Schema.Top): ReadonlyArray<FormField> => {
  const kept = fieldsMade.get(schema);
  if (kept) return kept;
  const ast = unwrapped(SchemaAST.toEncoded(schema.ast));
  const fields =
    ast._tag === 'Objects'
      ? ast.propertySignatures
          .filter((signature) => signature.name !== '_tag')
          .map((signature): FormField => {
            const description = SchemaAST.resolveDescription(signature.type);
            return {
              name: String(signature.name),
              optional: SchemaAST.isOptional(signature.type),
              ...inputOf(signature.type),
              ...(description ? { description } : {}),
            };
          })
      : [];
  fieldsMade.set(schema, fields);
  return fields;
};

// 3. Make
/** The Message a form makes, decoded, or why it cannot be made. */
export type Made =
  | { readonly ok: true; readonly message: { readonly _tag: string } }
  | { readonly ok: false; readonly error: string };

/** What a form holds, by field: a text box's text, a switch's state. */
export type Filled = Readonly<Record<string, string | boolean | undefined>>;

const valueOf = (
  field: FormField,
  filled: string | boolean | undefined,
):
  | { readonly skip: true }
  | { readonly value: unknown }
  | { readonly error: string } => {
  if (field.input.kind === 'boolean' && typeof filled === 'boolean')
    return { value: filled };
  const text = typeof filled === 'string' ? filled : '';
  if (text === '' && field.input.kind !== 'text') {
    if (field.optional) return { skip: true };
    if (field.nullable) return { value: null };
  }
  if (text === '' && field.input.kind === 'text' && field.optional)
    return { skip: true };
  switch (field.input.kind) {
    case 'text':
      return { value: text };
    case 'boolean':
      return { value: text === 'true' };
    case 'number': {
      const number = Number(text);
      return text.trim() === '' || Number.isNaN(number)
        ? { error: `${field.name} is not a number` }
        : { value: number };
    }
    case 'choice': {
      const index = Number(text);
      const options = field.input.options;
      return Number.isInteger(index) && index >= 0 && index < options.length
        ? { value: options[index] }
        : { error: `${field.name}: pick one` };
    }
    case 'json':
      try {
        return { value: JSON.parse(text) };
      } catch {
        return { error: `${field.name} is not JSON` };
      }
  }
};

/** The Message a Control's form makes: its encoded side from what is filled, decoded by its Schema. */
export const messageOf = (control: Control, filled: Filled): Made => {
  const encoded: Record<string, unknown> = { _tag: control.tag };
  for (const field of fieldsOf(control.schema)) {
    const one = valueOf(field, filled[field.name]);
    if ('error' in one) return { ok: false, error: one.error };
    if ('value' in one) encoded[field.name] = one.value;
  }
  try {
    const message = Schema.decodeUnknownSync(
      control.schema as Schema.Codec<unknown, unknown>,
    )(encoded) as { readonly _tag: string };
    return { ok: true, message };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

// 4. Send
/** Who a Control is Sent by, as its History entry says. */
export const FROM_BUBBLE: From = { kind: 'outside', name: 'fake bubble' };

/** Send a Control to the Instance at an Address: what became of it, `refused` once the Instance is gone. */
export const sendTo = (
  runtime: Runtime<AnyActor>,
  address: string,
  message: { readonly _tag: string; readonly [field: string]: unknown },
): Sent =>
  runtime.at(address as never)?.send(message as never, FROM_BUBBLE) ??
  'refused';
