import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Copy } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import type { PassReport } from '../../../../engine/session/index.ts';
import type { Transcript } from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';
import { PassesDialog } from './passes-dialog.tsx';
import { Timeline } from './timeline.tsx';

const dump = (
  transcript: Transcript<ContextPayload>,
  passes: ReadonlyArray<PassReport>,
): string =>
  JSON.stringify(
    {
      presses: transcript.segments.flatMap((segment) =>
        segment.kind === 'injected'
          ? [{ id: segment.id, at: segment.at, label: segment.payload.label }]
          : [],
      ),
      words: transcript.segments.flatMap((segment) =>
        segment.kind === 'transcription' ? segment.words : [],
      ),
      passes,
    },
    null,
    2,
  );

function Swatch({
  className,
  label,
}: {
  readonly className: string;
  readonly label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2.5 w-4 rounded-[3px]', className)} />
      {label}
    </span>
  );
}

/** Where each word and press sits on the audio clock; model passes on demand. */
export function DebugPanel({
  transcript,
  passes,
}: {
  readonly transcript: Transcript<ContextPayload>;
  readonly passes: ReadonlyArray<PassReport>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex h-11 items-center justify-between gap-3 px-4">
        <button
          type="button"
          aria-expanded={open}
          className="text-sm font-medium"
          onClick={() => setOpen((value) => !value)}
        >
          Timing {open ? '▾' : '▸'}
        </button>
        {open ? (
          <div className="flex items-center gap-1">
            <PassesDialog passes={passes} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(dump(transcript, passes));
              }}
            >
              <Copy />
              Copy JSON
            </Button>
          </div>
        ) : null}
      </header>
      {open ? (
        <div className="space-y-3 border-t p-3">
          <Timeline segments={transcript.segments} />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Swatch className="bg-foreground/80" label="final" />
            <Swatch
              className="border border-dashed border-muted-foreground/60 bg-muted"
              label="provisional"
            />
            <Swatch className="bg-primary" label="press" />
            <span>Click any word or press for its timing.</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
