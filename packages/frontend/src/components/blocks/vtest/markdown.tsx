import { useTheme } from 'next-themes';
import { Highlight, themes } from 'prism-react-renderer';
import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

import { Mermaid } from './mermaid';
import { parseDoc } from './utils';

type CodeProps = ComponentProps<'code'> & { inline?: boolean };

const detectLang = (className: string | undefined): string => {
  if (!className) return '';
  const m = /language-([\w-]+)/.exec(className);
  return m?.[1] ?? '';
};

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const { resolvedTheme } = useTheme();
  const prismTheme = resolvedTheme === 'light' ? themes.vsLight : themes.vsDark;
  if (lang === 'mermaid') return <Mermaid value={code} />;
  return (
    <div className="not-prose bg-card my-4 overflow-hidden rounded-lg border shadow-sm">
      {lang && lang !== 'text' && (
        <div className="text-muted-foreground bg-muted/40 border-b px-4 py-1.5 font-mono text-[10px] tracking-wider uppercase">
          {lang}
        </div>
      )}
      <Highlight code={code} language={lang || 'text'} theme={prismTheme}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} overflow-x-auto p-4 font-mono text-[13px] leading-relaxed`}
            style={style}
          >
            {tokens.map((line, i) => {
              const { key: _k, ...lineProps } = getLineProps({ line });
              return (
                <div key={i} {...lineProps}>
                  {line.map((token, j) => {
                    const { key: _tk, ...tokenProps } = getTokenProps({
                      token,
                    });
                    return <span key={j} {...tokenProps} />;
                  })}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

type Size = 'sm' | 'base';

// Researched prose classes tuned for technical-doc rendering (Stripe / Vercel
// / Rust Book conventions). Notes:
// - `prose-code:before/after:content-none` strips the backticks the typography
//   plugin injects around inline code by default.
// - `prose-blockquote:[&>p]:before/after:content-none` strips the curly quotes
//   it injects on blockquote paragraphs.
// - `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0` lets prose drop cleanly
//   into a constrained container (test cards) without punching dead space.
const baseProse =
  'prose dark:prose-invert max-w-none text-foreground/85 leading-7 ' +
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
  'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-headings:scroll-mt-20 ' +
  'prose-h1:text-3xl prose-h1:leading-tight prose-h1:mt-0 prose-h1:mb-6 ' +
  'prose-h2:text-xl prose-h2:leading-snug prose-h2:mt-10 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border ' +
  'prose-h3:text-lg prose-h3:leading-snug prose-h3:mt-8 prose-h3:mb-2 ' +
  'prose-h4:text-base prose-h4:mt-6 prose-h4:mb-2 ' +
  'prose-p:my-4 prose-p:leading-7 prose-p:text-foreground/85 ' +
  'prose-a:text-primary prose-a:font-medium prose-a:no-underline prose-a:underline-offset-4 hover:prose-a:underline ' +
  'prose-strong:text-foreground prose-strong:font-semibold prose-em:text-foreground ' +
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.875em] prose-code:font-normal prose-code:text-foreground ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:my-5 prose-pre:bg-transparent prose-pre:p-0 ' +
  'prose-ul:my-4 prose-ul:pl-6 prose-ol:my-4 prose-ol:pl-6 ' +
  'prose-li:my-1.5 prose-li:pl-1 prose-li:marker:text-muted-foreground/70 ' +
  'prose-blockquote:my-5 prose-blockquote:border-l-2 prose-blockquote:border-primary/50 prose-blockquote:bg-muted/40 prose-blockquote:py-2 prose-blockquote:pr-4 prose-blockquote:pl-4 prose-blockquote:rounded-r prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground ' +
  'prose-blockquote:[&>p:first-of-type]:before:content-none prose-blockquote:[&>p:last-of-type]:after:content-none ' +
  'prose-hr:my-10 prose-hr:border-border ' +
  'prose-table:my-6 prose-table:text-sm prose-table:border-collapse ' +
  'prose-thead:border-b prose-thead:border-border ' +
  'prose-th:font-semibold prose-th:text-foreground prose-th:text-left prose-th:px-3 prose-th:py-2 ' +
  'prose-tr:border-b prose-tr:border-border/60 ' +
  'prose-td:px-3 prose-td:py-2 prose-td:align-top prose-td:text-foreground/85 ' +
  'prose-img:rounded-md prose-img:border prose-img:border-border prose-img:my-6';

const smProse =
  'prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-6 ' +
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
  'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground ' +
  'prose-h1:text-base prose-h1:mt-0 prose-h1:mb-2 ' +
  'prose-h2:text-sm prose-h2:mt-4 prose-h2:mb-1.5 ' +
  'prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1 ' +
  'prose-h4:text-sm prose-h4:mt-3 prose-h4:mb-1 prose-h4:text-muted-foreground ' +
  'prose-p:my-2 prose-p:leading-6 prose-p:text-muted-foreground ' +
  'prose-a:text-primary prose-a:font-medium prose-a:no-underline prose-a:underline-offset-4 hover:prose-a:underline ' +
  'prose-strong:text-foreground prose-strong:font-semibold prose-em:text-foreground ' +
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.85em] prose-code:font-normal prose-code:text-foreground ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:my-3 prose-pre:bg-transparent prose-pre:p-0 ' +
  'prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 ' +
  'prose-li:my-0.5 prose-li:marker:text-muted-foreground/60 ' +
  'prose-blockquote:my-3 prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-3 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground ' +
  'prose-blockquote:[&>p:first-of-type]:before:content-none prose-blockquote:[&>p:last-of-type]:after:content-none ' +
  'prose-hr:my-4 prose-hr:border-border ' +
  'prose-table:my-3 prose-table:text-xs prose-table:border-collapse ' +
  'prose-thead:border-b prose-thead:border-border ' +
  'prose-th:font-semibold prose-th:text-foreground prose-th:text-left prose-th:px-2 prose-th:py-1.5 ' +
  'prose-tr:border-b prose-tr:border-border/50 ' +
  'prose-td:px-2 prose-td:py-1.5 prose-td:align-top ' +
  'prose-img:rounded prose-img:border prose-img:border-border prose-img:my-3';

const proseClass = (size: Size): string =>
  size === 'sm' ? smProse : baseProse;

export function Markdown({
  source,
  size = 'base',
}: {
  source: string;
  size?: Size;
}) {
  const { body } = parseDoc(source);
  return (
    <div className={proseClass(size)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        components={{
          code: ({ inline, className, children, ...rest }: CodeProps) => {
            const code = String(children ?? '').replace(/\n$/, '');
            const lang = detectLang(className);
            if (inline || !lang) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }
            return <CodeBlock lang={lang} code={code} />;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
