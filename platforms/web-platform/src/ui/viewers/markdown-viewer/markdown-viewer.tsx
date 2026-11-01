import {
  createContext,
  memo,
  useContext,
  useMemo,
  type ComponentProps,
  type MouseEvent,
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
 * and draw again only its last block, however long it is. Its plugins and
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
}: {
  readonly children: string;
  readonly className?: string;
  // Return true to take over the navigation for that href.
  readonly onLinkClick?: OnLinkClick;
}) {
  const blocks = useMemo(() => blocksOf(children), [children]);
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <LinkClick.Provider value={onLinkClick}>
        {blocks.map((block, at) => (
          <Block key={at} text={block} />
        ))}
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
 * the `pre` around a block is dropped.
 */
function MarkdownCode({ className, children }: ComponentProps<'code'>) {
  const text = String(children);
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  if (language === undefined && !text.includes('\n')) {
    return <code className={className}>{children}</code>;
  }
  return (
    <div className="not-prose my-3">
      <SourceViewer
        filePath={`snippet.${language ?? 'txt'}`}
        content={text.replace(/\n$/, '')}
        autoHeight
        showHeader={false}
        showLineNumbers={false}
        className={cn(
          'overflow-x-auto rounded-lg border border-border/60 bg-muted/40 [&_.source-viewer]:bg-transparent',
          scrollbarStyles,
        )}
      />
    </div>
  );
}
