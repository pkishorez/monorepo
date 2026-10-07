import type { ComponentProps, MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { SourceViewer } from '../source-viewer/index';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

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
            <th className="border-b border-border px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/50 px-3 py-2 align-top">
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

function MarkdownCode({ className, children }: ComponentProps<'code'>) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  if (language === undefined) {
    return <code className={className}>{children}</code>;
  }
  return (
    <div className="not-prose my-3">
      <SourceViewer
        filePath={`snippet.${language}`}
        content={String(children).replace(/\n$/, '')}
        autoHeight
        showHeader={false}
        showLineNumbers={false}
        className="rounded-lg border border-border"
      />
    </div>
  );
}
