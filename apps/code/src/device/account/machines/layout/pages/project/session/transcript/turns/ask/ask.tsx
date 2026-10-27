import { ZapIcon } from 'lucide-react';
import type { Row } from '../rows/index.ts';
import { Attachments } from './attachments.tsx';

/*
 * What you asked, on the right, as a bubble: its files over it, and, for
 * words sent while the agent worked, a quiet note under it. Wider on a
 * phone, where the column is narrow. A turn the agent began on its own has
 * no words: a quiet rule across the column says why it carried on.
 */

type TurnRow = Extract<Row, { readonly kind: 'turn' }>;

export function Ask({ row }: { readonly row: TurnRow }) {
  if (row.agentStarted)
    return (
      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="flex shrink-0 items-center gap-1.5">
          <ZapIcon aria-hidden className="size-3.5" />
          Background work finished · it carried on
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </p>
    );
  return (
    <div className="flex flex-col items-end gap-2 pl-8 sm:pl-16">
      <Attachments attachments={row.attachments} />
      {row.text !== '' && (
        <div className="max-w-full rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-base leading-7 text-pretty break-words whitespace-pre-wrap">
          {row.text}
        </div>
      )}
      {row.steered && (
        <span className="-mt-1 text-xs text-muted-foreground">
          Sent while it worked
        </span>
      )}
    </div>
  );
}
