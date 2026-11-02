import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import { type ComponentProps, createContext, use, useRef } from 'react';
import { type Opening, useFoldInPlace, useOpen } from './fold.tsx';

/*
 * The agent's words: markdown, inline code as a quiet chip without the
 * backticks prose adds; long words show their start until asked for all,
 * shown less again where they can be seen;
 * and a breathing dot while more are on their way. An image in them is
 * drawn as the page around says (`MarkdownImages`), as a session's page
 * draws a File Embed; with none, as markdown draws it. Words that are one
 * Message's say which (`MarkdownMessage`), so what draws an image in them
 * can tell the same image in two Messages apart.
 */

const prose =
  'prose-sm max-w-none leading-7 prose-p:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-headings:mt-5 prose-headings:mb-2 prose-code:rounded-[4px] prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.85em] prose-code:font-normal prose-code:break-words prose-code:before:content-none prose-code:after:content-none';

/** A web link opens in a new tab; any other, as a file the agent named, goes nowhere. */
const onLinkClick = (href: string) => {
  if (/^https?:\/\//.test(href))
    window.open(href, '_blank', 'noopener,noreferrer');
  return true;
};

type Viewer = ComponentProps<typeof MarkdownViewer>;

/** How the markdown under it draws an image it is given; none leaves each as markdown draws it. */
export const MarkdownImages = createContext<Viewer['image']>(undefined);

/** The Message the markdown under it is in, by id; empty outside one. */
export const MarkdownMessage = createContext('');

/**
 * Markdown in the transcript's prose; `block` and `from` as the viewer
 * takes them, and `message`, the Message it is in, when it is one's.
 */
export function Markdown({
  text,
  className = '',
  block,
  from,
  message,
}: {
  readonly text: string;
  readonly className?: string;
  readonly block?: Viewer['block'];
  readonly from?: number;
  readonly message?: string;
}) {
  const drawn = (
    <MarkdownViewer
      className={`${prose} ${className}`}
      onLinkClick={onLinkClick}
      image={use(MarkdownImages)}
      block={block}
      from={from}
    >
      {text}
    </MarkdownViewer>
  );
  return message === undefined ? (
    drawn
  ) : (
    <MarkdownMessage value={message}>{drawn}</MarkdownMessage>
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
  const whole = useOpen(opening, id) || !long;
  const words = useRef<HTMLDivElement>(null);
  const inPlace = useFoldInPlace();
  return (
    <div ref={words} className="flex flex-col items-start">
      <div
        className={
          whole
            ? 'w-full'
            : 'max-h-44 w-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
        }
      >
        <Markdown text={text} className={className} message={id} />
      </div>
      {long && (
        <button
          type="button"
          onClick={() => {
            inPlace(words.current, whole);
            opening.toggle(id);
          }}
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
