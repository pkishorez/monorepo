import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'kui-toolkit/components/ui/dialog';
import { cn } from 'kui-toolkit/utils';
import type { PassReport } from '../../../../engine/session/index.ts';

const outcomeTone: Record<PassReport['outcome'], string> = {
  transcribed: 'bg-emerald-500/70',
  last: 'bg-emerald-500/70',
  silent: 'bg-amber-500/60',
  skipped: 'bg-muted-foreground/40',
};

/** Where one pass's window sat within the whole run, and its frozen edge. */
function WindowBar({
  pass,
  end,
}: {
  readonly pass: PassReport;
  readonly end: number;
}) {
  const at = (seconds: number) => `${(seconds / end) * 100}%`;
  return (
    <span className="relative block h-2 w-40 rounded-full bg-muted">
      <span
        className={cn(
          'absolute inset-y-0 rounded-full',
          outcomeTone[pass.outcome],
        )}
        style={{
          left: at(pass.from),
          width: `max(2px, ${at(pass.to - pass.from)})`,
        }}
      />
      <span
        className="absolute -inset-y-0.5 w-0.5 bg-foreground"
        style={{ left: at(pass.frozenUntil) }}
      />
    </span>
  );
}

/** Every window sent to the model, what it returned, and how long it took. */
export function PassesDialog({
  passes,
}: {
  readonly passes: ReadonlyArray<PassReport>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const end = Math.max(1, ...passes.map((pass) => pass.to));
  const chosen = passes.find((pass) => pass.index === selected);

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>
        Passes
        <span className="text-muted-foreground tabular-nums">
          {passes.length}
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Model passes</DialogTitle>
          <DialogDescription>
            Each pass sends a window of recent audio to the model. The bar shows
            that window within the run; the dark tick is the frozen edge after
            the pass. Pick a row to see the words it returned.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
            <thead className="sticky top-0 bg-popover text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-normal">#</th>
                <th className="py-1 pr-3 font-normal">window</th>
                <th className="py-1 pr-3 font-normal" />
                <th className="py-1 pr-3 font-normal">outcome</th>
                <th className="py-1 pr-3 font-normal">took</th>
                <th className="py-1 font-normal">words</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((pass) => (
                <tr
                  key={pass.index}
                  className={cn(
                    'cursor-pointer hover:bg-muted/60',
                    selected === pass.index && 'bg-muted',
                  )}
                  onClick={() =>
                    setSelected(selected === pass.index ? null : pass.index)
                  }
                >
                  <td className="py-1 pr-3">{pass.index}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {pass.from.toFixed(2)}–{pass.to.toFixed(2)}s
                  </td>
                  <td className="py-1 pr-3">
                    <WindowBar pass={pass} end={end} />
                  </td>
                  <td className="py-1 pr-3">{pass.outcome}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {pass.durationMs} ms
                  </td>
                  <td className="py-1 tabular-nums">{pass.words.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="min-h-10 rounded-md bg-muted p-3 font-mono text-xs text-pretty">
          {chosen === undefined
            ? 'No pass selected.'
            : chosen.words.length === 0
              ? `Pass ${chosen.index} returned no words.`
              : chosen.words
                  .map((word) => `${word.text} @${word.start.toFixed(2)}`)
                  .join('  ')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
