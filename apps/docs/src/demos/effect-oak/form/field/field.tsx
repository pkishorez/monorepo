import { Context, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { Textarea } from '@kstackz/web-platform/components/textarea';
import { firstError } from './rules.js';
import type { Rule } from './rules.js';

/*
 * One form field as an Actor: its value, and whether it is NotValidated,
 * Validating, Valid or Invalid.
 *
 * Typing runs the field's Rules at once. If they pass and the field has an
 * async check, it goes to Validating and runs the check as a Command under
 * the `check` key, which replaces any check still running, so only the latest value's answer comes
 * back. Every change is reported to whoever Provides Fields: a Request, so
 * the form gets each field's value and validity without reading its Children.
 *
 * The status is Model data, not the Actor's States: a View draws each State
 * with its own component, so every Transition would remount the input and
 * take the focus away while typing.
 */

/** Whoever takes reports from fields: the form. */
export class Fields extends Context.Service<
  Fields,
  {
    readonly report: (
      key: string,
      field: { readonly value: string; readonly valid: boolean },
    ) => Effect.Effect<void>;
  }
>()('docs/form/Fields') {}

type Options = {
  /** The name the field reports under, and its input's id. */
  readonly key: string;
  readonly label: string;
  readonly type?: 'text' | 'email';
  readonly multiline?: boolean;
  readonly rules: ReadonlyArray<Rule>;
  /** An async check run once the Rules pass: an error, or null. */
  readonly check?: (value: string) => Effect.Effect<string | null>;
};

export { rules } from './rules.js';

export const makeField = (options: Options) => {
  const report = (value: string, valid: boolean) =>
    Effect.gen(function* () {
      yield* (yield* Fields).report(options.key, { value, valid });
    });

  const Field = Actor.make(`Field(${options.key})`, {
    requires: { fields: Fields },
    model: Schema.Struct({
      value: Schema.String,
      status: Schema.TaggedUnion({
        NotValidated: {},
        Validating: {},
        Valid: {},
        Invalid: { error: Schema.String },
      }),
    }),
    message: Schema.TaggedUnion({
      Typed: { value: Schema.String },
      CompletedCheck: {
        value: Schema.String,
        error: Schema.NullOr(Schema.String),
      },
    }),
  }).build({
    init: () => ({ model: { value: '', status: { _tag: 'NotValidated' } } }),
    update: {
      Typed: ({ value }) => {
        const error = firstError(options.rules, value);
        const { check } = options;
        if (error !== null)
          return {
            model: { value, status: { _tag: 'Invalid', error } },
            command: report(value, false),
            cancel: 'check',
          };
        if (!check)
          return {
            model: { value, status: { _tag: 'Valid' } },
            command: report(value, true),
          };
        return {
          model: { value, status: { _tag: 'Validating' } },
          command: {
            key: 'check',
            run: Effect.gen(function* () {
              yield* report(value, false);
              const error = yield* check(value);
              return { _tag: 'CompletedCheck' as const, value, error };
            }),
          },
        };
      },
      CompletedCheck: ({ value, error }, { model }) =>
        value !== model.value || model.status._tag !== 'Validating'
          ? {}
          : {
              model: {
                value,
                status:
                  error === null
                    ? { _tag: 'Valid' }
                    : { _tag: 'Invalid', error },
              },
              command: report(value, error === null),
            },
    },
  });

  const STATUS = {
    NotValidated: null,
    Validating: (
      <span className="text-sm text-muted-foreground">Checking…</span>
    ),
    Valid: <span className="text-sm text-green-600">✓</span>,
    Invalid: null,
  };

  const FieldView = View.make(Field, ({ model, send }) => {
    const { status } = model;
    const invalid = status._tag === 'Invalid';
    const props = {
      id: options.key,
      value: model.value,
      'aria-invalid': invalid,
      'aria-describedby': invalid ? `${options.key}-error` : undefined,
    };
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={options.key}>{options.label}</Label>
          {STATUS[status._tag]}
        </div>
        {options.multiline ? (
          <Textarea
            {...props}
            onChange={(event) =>
              send({ _tag: 'Typed', value: event.target.value })
            }
          />
        ) : (
          <Input
            {...props}
            type={options.type ?? 'text'}
            onChange={(event) =>
              send({ _tag: 'Typed', value: event.target.value })
            }
          />
        )}
        {status._tag === 'Invalid' && (
          <p id={`${options.key}-error`} className="text-sm text-destructive">
            {status.error}
          </p>
        )}
      </div>
    );
  });

  return { Field, FieldView };
};
