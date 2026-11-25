import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@kestack/web-platform/ui/components/toggle-group';
import type { RefObject } from 'react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import type { Strength } from '../../../../video/library/schema.ts';
import type { Pages } from '../../../shared/index.ts';

type Self = ViewProps<typeof Pages.ListLive>;

const STRENGTHS: ReadonlyArray<{
  readonly value: Strength;
  readonly hint: string;
}> = [
  { value: 'light', hint: 'keeps pauses up to 0.8 s' },
  { value: 'normal', hint: 'keeps pauses up to 0.5 s' },
  { value: 'heavy', hint: 'keeps pauses up to 0.3 s' },
];

/** A YouTube link and how hard to cut it, then Make. Refused, the CLI's line shows under it. */
export function Create({
  model,
  send,
  field,
}: Pick<Self, 'model' | 'send'> & {
  readonly field: RefObject<HTMLInputElement | null>;
}) {
  const refused = model.refused?.id === null ? model.refused.error : null;
  const hint = STRENGTHS.find(({ value }) => value === model.strength)?.hint;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        send({ _tag: 'Create' });
      }}
    >
      <label htmlFor="link" className="block text-sm font-medium">
        YouTube link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={field}
          id="link"
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=…"
          value={model.url}
          onChange={(event) => send({ _tag: 'Typed', url: event.target.value })}
          aria-invalid={refused !== null || undefined}
          aria-describedby={refused === null ? undefined : 'link-refused'}
          className="h-11 text-base sm:pointer-fine:h-10"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 px-4 sm:pointer-fine:h-10"
          disabled={model.creating || model.url.trim() === ''}
        >
          {model.creating && <Spinner />}
          Make short
        </Button>
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm sm:flex sm:flex-wrap">
        <span id="strength" className="text-muted-foreground">
          Strength
        </span>
        <ToggleGroup
          aria-labelledby="strength"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full sm:w-fit"
          value={[model.strength]}
          onValueChange={([picked]) => {
            const strength = STRENGTHS.find(
              ({ value }) => value === picked,
            )?.value;
            if (strength) send({ _tag: 'Picked', strength });
          }}
        >
          {STRENGTHS.map(({ value }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-11 flex-1 px-3 capitalize sm:pointer-fine:h-8 sm:flex-none"
            >
              {value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="col-span-2 text-muted-foreground">{hint}</span>
      </div>
      {refused !== null && (
        <p id="link-refused" role="alert" className="text-sm text-destructive">
          {refused}
        </p>
      )}
    </form>
  );
}
