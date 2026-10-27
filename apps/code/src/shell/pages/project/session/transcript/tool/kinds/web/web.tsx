import {
  ArrowUpRightIcon,
  GlobeIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { type Kind, Output } from '../../output/index.ts';

/** A page fetched, or the web searched: opened, a link to the page, and what came back. */
export const web: Kind = {
  icon: GlobeIcon,
  Detail: ({ row, opening }) => {
    const url = (row.call.input as { url?: unknown } | null)?.url;
    return (
      <>
        {typeof url === 'string' && /^https?:\/\//.test(url) && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-11 max-w-full items-center gap-1 self-start rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground keyboard:min-h-0"
          >
            <span className="truncate">{url}</span>
            <ArrowUpRightIcon aria-hidden className="size-3 shrink-0" />
          </a>
        )}
        <Output
          row={row}
          opening={opening}
          label={typeof url === 'string' ? 'What the page said' : 'Results'}
        />
      </>
    );
  },
};
