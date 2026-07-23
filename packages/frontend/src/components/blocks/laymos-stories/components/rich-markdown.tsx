import { useEffect, useState, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '#lib/utils';

export function RichMarkdown({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:scroll-mt-16 prose-a:text-primary prose-pre:border prose-pre:border-border prose-pre:bg-muted/45',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children: code }) => code,
          code: ({
            className: codeClassName,
            children: code,
            ...props
          }: ComponentProps<'code'>) => {
            const language = codeClassName?.match(/language-([\w-]+)/)?.[1];
            return language === undefined ? (
              <code className="font-mono text-[0.9em]" {...props}>
                {code}
              </code>
            ) : (
              <HighlightedCode
                code={String(code).replace(/\n$/, '')}
                language={language}
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function HighlightedCode({
  code,
  language,
}: {
  readonly code: string;
  readonly language: string;
}) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let active = true;
    void import('shiki')
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }),
      )
      .then((value) => {
        if (active) setHtml(value);
      })
      .catch(() => {
        if (active) setHtml(undefined);
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  if (html === undefined) {
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/45 p-4">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="[&_.shiki]:overflow-x-auto [&_.shiki]:rounded-md [&_.shiki]:border [&_.shiki]:border-border [&_.shiki]:p-4 dark:[&_.shiki]:bg-[var(--shiki-dark-bg)] dark:[&_.shiki_span]:text-[var(--shiki-dark)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
