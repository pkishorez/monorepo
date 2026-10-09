import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { XIcon } from '@kstackz/web-platform/components/lucide';

export const entryHint =
  'Point Monoverse at a monorepo root or a package folder by its absolute path.';

/** The path and label of one entry, for adding it or editing it. */
export function EntryForm({
  idPrefix,
  initial,
  submitLabel,
  submitIcon,
  pending,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial?: { path: string; label: string | null };
  submitLabel: string;
  submitIcon: ReactNode;
  pending: boolean;
  onSubmit: (input: { path: string; label: string | null }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [pathDraft, setPathDraft] = useState(initial?.path ?? '');
  const [labelDraft, setLabelDraft] = useState(initial?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const pathValid = pathDraft.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pathValid || pending) return;
    setError(null);
    try {
      await onSubmit({
        path: pathDraft.trim(),
        label: labelDraft.trim() || null,
      });
      if (!initial) {
        setPathDraft('');
        setLabelDraft('');
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && pathValid) {
      event.preventDefault();
      void submit(event);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-path`} className="sr-only">
          Absolute folder path
        </Label>
        <Input
          id={`${idPrefix}-path`}
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="/Users/you/repo"
          className="h-11 font-mono text-base sm:h-9 sm:text-sm"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor={`${idPrefix}-label`} className="sr-only">
          Label
        </Label>
        <Input
          id={`${idPrefix}-label`}
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="Label (optional)"
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
        <Button
          type="submit"
          className="min-h-11 sm:min-h-0"
          disabled={!pathValid || pending}
        >
          {submitIcon}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 sm:min-h-0"
            onClick={onCancel}
          >
            <XIcon className="size-4" />
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error)
    return String(error.message);
  return String(error);
}
