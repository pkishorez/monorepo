import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import type { Opening } from '../fold/index.ts';

/*
 * The agent's words: markdown, inline code as a quiet chip without the
 * backticks prose adds; long words show their start until asked for all;
 * and a breathing dot while more are on their way.
 */

const prose =
  'prose-sm max-w-none leading-7 prose-p:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-headings:mt-5 prose-headings:mb-2 prose-code:rounded-[4px] prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.85em] prose-code:font-normal prose-code:break-words prose-code:before:content-none prose-code:after:content-none';

/** A web link opens in a new tab; any other, as a file the agent named, goes nowhere. */
const onLinkClick = (href: string) => {
  if (/^https?:\/\//.test(href))
    window.open(href, '_blank', 'noopener,noreferrer');
  return true;
};

/** Markdown in the transcript's prose. */
export function Markdown({
  text,
  className = '',
}: {
  readonly text: string;
  readonly className?: string;
}) {
  return (
    <MarkdownViewer
      className={`${prose} ${className}`}
      onLinkClick={onLinkClick}
    >
      {text}
    </MarkdownViewer>
  );
}

/** Words that may run long: their start, until asked for all. */
export function Long({
  id,
  opening,
  text,
  className = 'text-sm',
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly text: string;
  readonly className?: string;
}) {
  const long = text.length > 700 || text.split('\n').length > 10;
  const whole = !long || opening.isOpen(id);
  return (
    <div className="flex flex-col items-start">
      <div
        className={
          whole
            ? 'w-full'
            : 'max-h-44 w-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
        }
      >
        <Markdown text={text} className={className} />
      </div>
      {long && (
        <button
          type="button"
          onClick={() => opening.toggle(id)}
          className="focus-ring mt-1 min-h-11 cursor-pointer rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground keyboard:min-h-0"
        >
          {whole ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

/** More words on their way: a small dot, breathing unless motion is reduced. */
export function Writing() {
  return (
    <span role="status" className="flex h-5 items-center">
      <span className="sr-only">Writing</span>
      <span
        aria-hidden
        className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
      />
    </span>
  );
}
