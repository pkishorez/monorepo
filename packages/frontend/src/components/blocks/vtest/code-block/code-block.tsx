import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';

import { highlighter, resolveLang, THEMES } from './highlighter';

interface CodeBlockProps {
  /** Source to render. */
  code: string;
  /** Language id (e.g. `tsx`, `bash`, `json`); defaults to `tsx`. */
  language?: string;
  /** Show a left gutter of line numbers. Defaults to true. */
  showLineNumbers?: boolean;
  /** 1-based line numbers to highlight (absolute file lines, e.g. an error line). */
  highlightLines?: readonly number[];
  /**
   * 1-based file line number of the FIRST rendered line. Defaults to 1. Use when
   * `code` is a sliced excerpt so the gutter still shows original file lines.
   */
  startLineNumber?: number;
  /** Header label (mono, truncated). A `title` tooltip shows the full string. */
  filename?: string;
  /** When true, render the header bar with a copy button even without a filename. */
  showHeader?: boolean;
  /** Extra controls rendered in the header, left of the copy button. */
  actions?: ReactNode;
  /** Extra classes for the scroll container. */
  className?: string;
}

/**
 * Syntax-highlighted, theme-aware source viewer used across the vtest views to
 * show the code behind a test. Tokenizes synchronously via a shared Shiki
 * highlighter (JS-regex engine, no async WASM) and emits both light and dark
 * colours in one pass — each token carries a `--shiki-dark` CSS variable that
 * `shiki.css` swaps in under `[data-theme='dark']`, so the block tracks the
 * app theme. The container itself uses app surface tokens so it sits inside
 * cards and panes in either theme.
 *
 * Pass {@link CodeBlockProps.startLineNumber} to render a sliced excerpt with
 * original file line numbers in the gutter; {@link CodeBlockProps.highlightLines}
 * stay absolute 1-based file lines. An opt-in header bar (via `filename` or
 * `showHeader`) adds a language label and a copy button.
 */
export function CodeBlock({
  code,
  language = 'tsx',
  showLineNumbers = true,
  highlightLines = [],
  startLineNumber = 1,
  filename,
  showHeader,
  actions,
  className,
}: CodeBlockProps) {
  const highlight = new Set(highlightLines);
  const hasHeader = showHeader ?? Boolean(filename);
  const clean = code.replace(/\n$/, '');
  const gutterWidth = `${String(startLineNumber + clean.split('\n').length).length}ch`;

  const lines = useMemo(() => {
    const { tokens } = highlighter.codeToTokens(clean, {
      lang: resolveLang(language),
      themes: THEMES,
      defaultColor: 'light',
    });
    return tokens;
  }, [clean, language]);

  return (
    <div
      className={`not-prose group/code overflow-hidden border border-border bg-card ${className ?? ''}`}
    >
      {hasHeader && (
        <CodeHeader
          filename={filename}
          language={language}
          code={clean}
          actions={actions}
        />
      )}
      <pre className="shiki overflow-auto p-0 text-[0.8125rem] leading-[1.7] tracking-[-0.01em]">
        <code className="block min-w-fit py-4 font-mono">
          {lines.map((line, i) => {
            const fileLine = startLineNumber + i;
            const isHot = highlight.has(fileLine);
            return (
              <div
                key={i}
                className={`flex pr-6 pl-5 ${
                  isHot
                    ? 'bg-amber-300/[0.07] shadow-[inset_2px_0_0_0_rgba(251,191,36,0.5)]'
                    : ''
                }`}
              >
                {showLineNumbers && (
                  <span
                    className="mr-5 shrink-0 select-none text-right text-muted-foreground/40 tabular-nums transition-colors group-hover/code:text-muted-foreground/70"
                    style={{ width: gutterWidth }}
                  >
                    {fileLine}
                  </span>
                )}
                <span className="flex-1">
                  {line.map((token, key) => (
                    <span
                      key={key}
                      className="shiki-token"
                      style={token.htmlStyle as CSSProperties}
                    >
                      {token.content}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

/** Header row for the code block: a language pill, label, actions and copy. */
function CodeHeader({
  filename,
  language,
  code,
  actions,
}: {
  filename?: string;
  language: string;
  code: string;
  actions?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3">
      <span className="flex shrink-0 gap-1.5" aria-hidden>
        <span className="size-3 rounded-full bg-muted-foreground/20" />
        <span className="size-3 rounded-full bg-muted-foreground/20" />
        <span className="size-3 rounded-full bg-muted-foreground/20" />
      </span>
      {filename ? (
        <span
          className="min-w-0 flex-1 truncate text-center font-mono text-xs text-muted-foreground"
          title={filename}
        >
          {filename}
        </span>
      ) : (
        <span className="flex-1 font-mono text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
          {language}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon className="size-3.5 text-emerald-400" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
