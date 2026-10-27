import type { ComponentProps, MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { SourceViewer } from '../source-viewer/index';
import { scrollbarStyles } from '#kit/scroll-styles';
import { cn } from '#kit/class-names';

export function MarkdownViewer({
  children,
  className,
  onLinkClick,
}: {
  readonly children: string;
  readonly className?: string;
  // Return true to take over the navigation for that href.
  readonly onLinkClick?: (href: string) => boolean | void;
}) {
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, node: _node, ...rest }) => (
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
          ),
          pre: ({ children }) => <>{children}</>,
          code: MarkdownCode,
          table: ({ children }) => (
            <div
              className={cn('not-prose my-4 overflow-x-auto', scrollbarStyles)}
            >
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-semibold first:pl-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/50 px-3 py-2 align-top first:pl-0">
              {children}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

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
