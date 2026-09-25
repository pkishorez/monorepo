import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Copy } from 'kui-toolkit/lucide';
import type { PassReport } from '../../../../engine/session/index.ts';
import type { Transcript } from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';
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

/** Timestamps of the run laid out on the audio clock, plus a pass table. */
export function DebugPanel({
  transcript,
  passes,
}: {
  readonly transcript: Transcript<ContextPayload>;
  readonly passes: ReadonlyArray<PassReport>;
}) {
  const [selectedPass, setSelectedPass] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <button
          type="button"
          className="text-sm font-medium"
          onClick={() => setOpen((value) => !value)}
        >
          Timing debug {open ? '▾' : '▸'}
        </button>
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
      </header>
      {open ? (
        <div className="space-y-3 p-3">
          <p className="text-xs text-muted-foreground">
            Green bars are windows sent to the model, with the frozen edge after
            each pass as a dark tick. Tap a pass to see the words it returned,
            raw, in blue. The transcript row is what placement used: solid words
            are final, dashed are provisional. Presses are the purple lines. A
            press lands after every word that started before it.
          </p>
          <Timeline
            segments={transcript.segments}
            passes={passes}
            selectedPass={selectedPass}
            onSelectPass={setSelectedPass}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pr-3">#</th>
                  <th className="pr-3">window</th>
                  <th className="pr-3">outcome</th>
                  <th className="pr-3">model</th>
                  <th className="pr-3">words</th>
                  <th className="pr-3">frozen</th>
                  <th>first / last word</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((pass) => (
                  <tr
                    key={pass.index}
                    className={
                      selectedPass === pass.index ? 'bg-muted' : undefined
                    }
                    onClick={() =>
                      setSelectedPass(
                        selectedPass === pass.index ? null : pass.index,
                      )
                    }
                  >
                    <td className="pr-3">{pass.index}</td>
                    <td className="pr-3">
                      {pass.from.toFixed(2)}–{pass.to.toFixed(2)}s
                    </td>
                    <td className="pr-3">{pass.outcome}</td>
                    <td className="pr-3">{pass.durationMs} ms</td>
                    <td className="pr-3">{pass.words.length}</td>
                    <td className="pr-3">{pass.frozenUntil.toFixed(2)}s</td>
                    <td>
                      {pass.words.length > 0
                        ? `${pass.words[0]!.text} @${pass.words[0]!.start.toFixed(2)} … ${pass.words[pass.words.length - 1]!.text} @${pass.words[pass.words.length - 1]!.end.toFixed(2)}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
