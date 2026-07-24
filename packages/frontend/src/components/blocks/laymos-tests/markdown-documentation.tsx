import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownDocumentation({
  markdown,
}: {
  readonly markdown: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children }) => {
          const language = className?.match(/language-([\w-]+)/)?.[1];
          const code = String(children).replace(/\n$/, '');
          return language ? (
            <ShikiCode code={code} language={language} />
          ) : (
            <code className={className}>{children}</code>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function ShikiCode({
  code,
  language,
}: {
  readonly code: string;
  readonly language: string;
}) {
  const [html, setHtml] = useState<string>();

  useEffect(() => {
    let active = true;
    setHtml(undefined);
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
        if (active) setHtml('');
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  if (!html) return <FallbackCode>{code}</FallbackCode>;
  return (
    <div
      className="not-prose my-3 [&_.shiki]:overflow-x-auto [&_.shiki]:rounded-md [&_.shiki]:border [&_.shiki]:border-border [&_.shiki]:bg-muted/20! [&_.shiki]:p-3 [&_.shiki]:text-xs [&_.shiki]:leading-5 dark:[&_.shiki_span]:text-[var(--shiki-dark)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function FallbackCode({ children }: { readonly children: ReactNode }) {
  return (
    <pre className="not-prose my-3 overflow-x-auto rounded-md border bg-muted/20 p-3 text-xs leading-5">
      <code>{children}</code>
    </pre>
  );
}
