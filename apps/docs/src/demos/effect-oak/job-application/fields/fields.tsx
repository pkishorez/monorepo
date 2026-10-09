import { Schema } from 'effect';
import type { ReactNode } from 'react';
import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { Textarea } from '@kstackz/web-platform/components/textarea';
import { firstError } from './rules.js';
import type { Rule } from './rules.js';

/*
 * A validated text field as Model data, Foldkit's `Field` in two parts: what
 * was typed, and whether its errors show yet. A field's errors show once it
 * is typed in, or once Submit reveals them; until then it is quiet, like
 * Foldkit's NotValidated. Whether it is valid is worked out from its Rules,
 * never stored, so there is nothing to keep in sync.
 *
 * Fields are data inside a step's Model, not Nodes: a step has too many to
 * make each a Child, and the entries that hold them are a list (blocker 1).
 */

export const TextField = Schema.Struct({
  value: Schema.String,
  shown: Schema.Boolean,
});
export type TextField = typeof TextField.Type;

export const blank: TextField = { value: '', shown: false };

export const typed = (value: string): TextField => ({ value, shown: true });

export const revealed = (field: TextField): TextField => ({
  ...field,
  shown: true,
});

/** The error to draw: the first broken Rule, once the field shows errors. */
export const errorOf = (all: ReadonlyArray<Rule>, field: TextField) =>
  field.shown ? firstError(all, field.value) : null;

export const passes = (all: ReadonlyArray<Rule>, field: TextField) =>
  firstError(all, field.value) === null;

export { rules } from './rules.js';

type FieldProps = {
  readonly id: string;
  readonly label: string;
  readonly error?: string | null;
  readonly hint?: ReactNode;
};

/** A label, an input of some kind, and its error or hint underneath. */
const Labelled = ({
  id,
  label,
  error,
  hint,
  children,
}: FieldProps & { readonly children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-sm text-destructive">
        {error}
      </p>
    ) : (
      hint && <p className="text-sm text-muted-foreground">{hint}</p>
    )}
  </div>
);

export const TextInput = ({
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
  ...field
}: FieldProps & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'email' | 'tel' | 'url' | 'date';
  readonly placeholder?: string;
  readonly min?: string;
  readonly max?: string;
}) => (
  <Labelled {...field}>
    <Input
      id={field.id}
      type={type}
      value={value}
      placeholder={placeholder}
      min={min || undefined}
      max={max || undefined}
      aria-invalid={Boolean(field.error)}
      aria-describedby={field.error ? `${field.id}-error` : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  </Labelled>
);

export const TextArea = ({
  value,
  onChange,
  rows,
  placeholder,
  ...field
}: FieldProps & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
  readonly placeholder?: string;
}) => (
  <Labelled {...field}>
    <Textarea
      id={field.id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-invalid={Boolean(field.error)}
      onChange={(event) => onChange(event.target.value)}
    />
  </Labelled>
);
