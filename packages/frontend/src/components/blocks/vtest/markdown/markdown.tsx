import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';

import { CodeBlock } from '../code-block';
import { MermaidDiagram } from '../mermaid-diagram';

interface MarkdownProps {
  source: string;
}

/**
 * Routes fenced code blocks through {@link CodeBlock} (Shiki) for syntax
 * highlighting while leaving inline code as the prose pill style. A `mermaid`
 * fence is rendered as a diagram via {@link MermaidDiagram} instead. The
 * language is read from the fence info string (`language-ts` → `ts`), falling
 * back to `tsx`.
 */
function CodeRenderer({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className ?? '');
  if (!match) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
  const code = String(children).replace(/\n$/, '');
  const language = match[1] || 'tsx';
  if (language === 'mermaid') {
    return <MermaidDiagram code={code} />;
  }
  return (
    <div className="my-6">
      <CodeBlock code={code} language={language} showHeader />
    </div>
  );
}

/**
 * Pass-through for fenced blocks: react-markdown wraps them in a `<pre>`, but
 * {@link CodeBlock} brings its own bordered container, so the wrapper would
 * render a second box around it. Emitting the children directly avoids that.
 */
function PreRenderer({ children }: ComponentPropsWithoutRef<'pre'>) {
  return <>{children}</>;
}

/**
 * Renders a markdown fragment as readable documentation prose, themed against
 * the app's design tokens via the `@tailwindcss/typography` plugin. Kept thin so
 * the feature page can render one topic's markdown at a time.
 */
export function Markdown({ source }: MarkdownProps) {
  return (
    <div
      className="prose prose-base dark:prose-invert max-w-none leading-relaxed
        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground
        prose-h1:text-3xl prose-h2:mt-8 prose-h2:text-2xl prose-h3:text-lg
        prose-p:text-foreground/85
        prose-li:text-foreground/85 prose-li:my-1.5
        prose-strong:text-foreground prose-strong:font-semibold
        prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4
        prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.875em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
        prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0
        prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground
        prose-hr:border-border/60
        prose-img:rounded-lg prose-img:border prose-img:border-border
        prose-table:text-sm prose-th:text-foreground prose-th:font-semibold prose-td:border-border prose-th:border-border"
    >
      <ReactMarkdown
        rehypePlugins={[rehypeSlug]}
        components={{ code: CodeRenderer, pre: PreRenderer }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
