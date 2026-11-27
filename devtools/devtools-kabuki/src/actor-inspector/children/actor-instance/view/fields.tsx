import { useId } from 'react';
import { Input as TextInput } from '@kestack/web-platform/ui/components/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/ui/components/native-select';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { Textarea } from '@kestack/web-platform/ui/components/textarea';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { fieldDraft } from '../logic/shared/index.ts';
import type {
  Draft,
  FormField,
  Input,
  Problem,
} from '../logic/shared/index.ts';

const CONTROL = 'h-7 px-2 font-mono text-xs md:text-xs';

function Control({
  id,
  input,
  draft,
  blank,
  invalid,
  onDraft,
}: {
  readonly id: string;
  readonly input: Exclude<Input, { readonly kind: 'group' }>;
  readonly draft: Draft;
  readonly blank: string | undefined;
  readonly invalid: boolean;
  readonly onDraft: (draft: Draft) => void;
}) {
  const text = typeof draft === 'string' ? draft : '';
  switch (input.kind) {
    case 'text':
    case 'number':
      return (
        <TextInput
          id={id}
          value={text}
          inputMode={input.kind === 'number' ? 'decimal' : undefined}
          placeholder={blank ?? (input.kind === 'number' ? '0' : '')}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onDraft(event.target.value)}
          className={CONTROL}
        />
      );
    case 'switch':
      return (
        <Switch
          id={id}
          size="sm"
          checked={draft === true}
          onCheckedChange={(on) => onDraft(on)}
        />
      );
    case 'choice':
      return (
        <NativeSelect
          id={id}
          size="sm"
          value={text}
          aria-invalid={invalid || undefined}
          onChange={(event) => onDraft(event.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="">
            {blank ?? 'Pick one'}
          </NativeSelectOption>
          {input.options.map((option, index) => (
            <NativeSelectOption key={index} value={String(index)}>
              {JSON.stringify(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case 'json':
      return (
        <Textarea
          id={id}
          value={text}
          rows={2}
          placeholder={blank ?? input.hint}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          onChange={(event) => onDraft(event.target.value)}
          className="min-h-14 px-2 py-1 font-mono text-xs md:text-xs"
        />
      );
  }
}

const blankOf = (field: FormField) =>
  field.optional ? 'left out' : field.nullable ? 'null' : undefined;

function Row({
  field,
  path,
  draft,
  problems,
  onDraft,
}: {
  readonly field: FormField;
  readonly path: string;
  readonly draft: Draft;
  readonly problems: ReadonlyArray<Problem>;
  readonly onDraft: (draft: Draft) => void;
}) {
  const id = useId();
  const problem = problems.find((one) => one.path === path)?.problem;
  const label = (
    <label
      htmlFor={id}
      title={field.description}
      className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px]"
    >
      <span className="truncate">{field.name}</span>
      {(field.optional || field.nullable) && (
        <span className="shrink-0 text-muted-foreground/70">
          {field.optional ? 'optional' : 'nullable'}
        </span>
      )}
    </label>
  );
  if (field.input.kind === 'group')
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 font-mono text-[11px]">{field.name}</legend>
        <div className="border-l border-border pl-2.5">
          <Fields
            input={field.input}
            path={path}
            draft={draft}
            problems={problems}
            onDraft={onDraft}
          />
        </div>
      </fieldset>
    );
  return (
    <div
      className={cn(
        'flex gap-1',
        field.input.kind === 'switch'
          ? 'flex-row-reverse items-center justify-end gap-2'
          : 'flex-col',
      )}
    >
      {label}
      <Control
        id={id}
        input={field.input}
        draft={draft}
        blank={blankOf(field)}
        invalid={problem !== undefined}
        onDraft={onDraft}
      />
      {problem && <p className="text-[11px] text-destructive">{problem}</p>}
    </div>
  );
}

export function Fields({
  input,
  draft,
  problems = [],
  path = '',
  onDraft,
}: {
  readonly input: Input;
  readonly draft: Draft;
  readonly problems?: ReadonlyArray<Problem>;
  readonly path?: string;
  readonly onDraft: (draft: Draft) => void;
}) {
  if (input.kind !== 'group') {
    const problem = problems.find((one) => one.path === path)?.problem;
    return (
      <div className="flex flex-col gap-1">
        <Control
          id={path}
          input={input}
          draft={draft}
          blank={undefined}
          invalid={problem !== undefined}
          onDraft={onDraft}
        />
        {problem && <p className="text-[11px] text-destructive">{problem}</p>}
      </div>
    );
  }
  if (input.fields.length === 0)
    return <p className="text-[11px] text-muted-foreground">Carries nothing</p>;
  const record = typeof draft === 'object' ? draft : {};
  return (
    <div className="flex flex-col gap-2">
      {input.fields.map((field) => (
        <Row
          key={field.name}
          field={field}
          path={path === '' ? field.name : `${path}.${field.name}`}
          draft={fieldDraft(draft, field)}
          problems={problems}
          onDraft={(next) => onDraft({ ...record, [field.name]: next })}
        />
      ))}
    </div>
  );
}
