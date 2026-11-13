import { CheckIcon, CopyIcon, XIcon } from 'lucide-react';
import {
  createContext,
  Fragment,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { SourceViewer } from '../source-viewer/index';
import { blocksOf } from './blocks';
import { scrollbarStyles } from '#kit/scroll-styles';
import { cn } from '#kit/class-names';

/*
 * Markdown, drawn again only when its text or its look changes, and then
 * a block at a time (`blocks.ts`): words streaming in at its end parse
 * and draw again only its last block, however long it is. What draws it
 * may wrap each block (`block`), and leave its first ones out (`from`),
 * as a list that draws only what is near the view does; the blocks are
 * `blocksOf` its text. Its plugins and
 * components are the same on every draw: a component made anew each time
 * is a new kind of element to React, which would take down and build
 * again everything under it, its code blocks highlighted again from
 * nothing. What a link click does reaches them through context.
 */

type OnLinkClick = (href: string) => boolean | void;

const LinkClick = createContext<OnLinkClick | undefined>(undefined);

const remarkPlugins = [remarkGfm];

const components: Components = {
  a: function MarkdownLink({ href, children, node: _node, ...rest }) {
    const onLinkClick = useContext(LinkClick);
    return (
      <a
        href={href}
        {...rest}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (href !== undefined && onLinkClick?.(href) === true) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </a>
    );
  },
  pre: function MarkdownPre({ children }) {
    return <>{children}</>;
  },
  code: MarkdownCode,
  table: function MarkdownTable({ children }) {
    return (
      <div className={cn('not-prose my-4 overflow-x-auto', scrollbarStyles)}>
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th: function MarkdownTh({ children }) {
    return (
      <th className="border-b border-border px-3 py-2 text-left font-semibold first:pl-0">
        {children}
      </th>
    );
  },
  td: function MarkdownTd({ children }) {
    return (
      <td className="border-b border-border/50 px-3 py-2 align-top first:pl-0">
        {children}
      </td>
    );
  },
};

export const MarkdownViewer = memo(function MarkdownViewer({
  children,
  className,
  onLinkClick,
  block,
  from = 0,
}: {
  readonly children: string;
  readonly className?: string;
  // Return true to take over the navigation for that href.
  readonly onLinkClick?: OnLinkClick;
  /** Wraps each block drawn, by its place among them all. */
  readonly block?: (at: number, drawn: ReactNode) => ReactNode;
  /** The first block drawn; those before it are left out. */
  readonly from?: number;
}) {
  const blocks = useMemo(() => blocksOf(children), [children]);
  return (
    <div
      className={cn(
        'prose dark:prose-invert max-w-none',
        // Wrapped, a block's first and last margins would reach out of it.
        block &&
          '[&>:first-child>:first-child]:mt-0 [&>:last-child>:last-child]:mb-0',
        className,
      )}
    >
      <LinkClick.Provider value={onLinkClick}>
        {blocks.slice(from).map((text, each) => {
          const drawn = <Block key={from + each} text={text} />;
          return block ? (
            <Fragment key={from + each}>{block(from + each, drawn)}</Fragment>
          ) : (
            drawn
          );
        })}
      </LinkClick.Provider>
    </div>
  );
});

/** One top-level block, parsed and drawn again only as its own text changes. */
const Block = memo(function Block({ text }: { readonly text: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {text}
    </ReactMarkdown>
  );
});

/*
 * Code: inline, a chip in the line; a block, fenced or indented, with a
 * language or without, a quiet filled box, flush with the text's edge,
 * its words inset inside it; a long line scrolls sideways inside the box. A block's text always ends in a newline;
 * inline code never holds one, so that is what tells them apart, since
 * the `pre` around a block is dropped. A block has a way to copy it at its
 * top right, outside what scrolls, so it stays put as a long line moves.
 */
function MarkdownCode({ className, children }: ComponentProps<'code'>) {
  const text = String(children);
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  if (language === undefined && !text.includes('\n')) {
    return <code className={className}>{children}</code>;
  }
  const content = text.replace(/\n$/, '');
  return (
    <div className="group/code not-prose relative my-3">
      <SourceViewer
        filePath={`snippet.${language ?? 'txt'}`}
        content={content}
        autoHeight
        showHeader={false}
        showLineNumbers={false}
        className={cn(
          'overflow-x-auto rounded-lg border border-border/60 bg-muted/40 [&_.source-viewer]:bg-transparent',
          scrollbarStyles,
        )}
      />
      <CopyCode text={content} />
    </div>
  );
}

/**
 * Copies a block, and says how that went for a moment. Shown on pointing at
 * the block, or focus; always on a touch screen, where a finger reaches past
 * its small square.
 */
function CopyCode({ text }: { readonly text: string }) {
  const [told, setTold] = useState<'copied' | 'refused' | null>(null);
  useEffect(() => {
    if (told === null) return;
    const timer = setTimeout(() => setTold(null), 1500);
    return () => clearTimeout(timer);
  }, [told]);
  const label = told === 'refused' ? "Couldn't copy" : 'Copy the code';
  return (
    <button
      type="button"
      aria-label={told === 'copied' ? 'Copied' : label}
      title={label}
      onClick={() => {
        void (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
          () => setTold('copied'),
          () => setTold('refused'),
        );
      }}
      className={cn(
        'focus-ring absolute top-1 right-1 grid size-7 place-items-center rounded-md bg-muted text-muted-foreground transition-[color,opacity] duration-150 hover:text-foreground motion-reduce:transition-none pointer-coarse:after:absolute pointer-coarse:after:-inset-2 [&_svg]:size-3.5',
        told === null
          ? 'opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 [@media(hover:none)]:opacity-100'
          : 'opacity-100',
      )}
    >
      {told === 'copied' && <CheckIcon aria-hidden />}
      {told === 'refused' && <XIcon aria-hidden />}
      {told === null && <CopyIcon aria-hidden />}
    </button>
  );
}
