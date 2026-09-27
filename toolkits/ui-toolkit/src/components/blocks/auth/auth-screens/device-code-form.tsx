import { CircleAlert } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { cn } from '#lib/utils';

import { PendingContent, useAction } from '../action-button';

const HINT = 'Your device or terminal shows this code.';

export function DeviceCodeForm({
  initialCode = '',
  initialError,
  onCheck,
}: {
  initialCode?: string | undefined;
  initialError?: string | undefined;
  onCheck: (code: string) => Promise<unknown>;
}) {
  const id = useId();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState(initialError);
  const check = useAction(() => onCheck(code), setError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    check.run();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-code`}>Code</Label>
        <Input
          id={`${id}-code`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(undefined);
          }}
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          data-1p-ignore
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-line`}
          className="h-14 text-center font-mono text-2xl font-semibold tracking-[0.25em] uppercase tabular-nums md:text-2xl"
        />
        <p
          id={`${id}-line`}
          aria-live="polite"
          className={cn(
            'flex min-h-5 items-start gap-1.5 text-sm',
            error ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {error ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : null}
          <span>{error ?? HINT}</span>
        </p>
      </div>
      <Button
        type="submit"
        size="lg"
        className="relative"
        disabled={check.pending || code.trim() === ''}
        aria-busy={check.pending}
      >
        <PendingContent pending={check.pending}>Continue</PendingContent>
      </Button>
    </form>
  );
}
