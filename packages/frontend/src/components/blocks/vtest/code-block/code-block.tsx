import type { ReactNode } from 'react';
import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';

interface CodeBlockProps {
  /** Source to render. */
  code: string;
  /** Prism language id; defaults to `tsx` (vtest tests are TS/TSX). */
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
 * show the code behind a test. Synchronous (prism-react-renderer) so it renders
 * during SSR with no async highlighter, and reads the app's dark/light tokens
 * via a CSS-variable-driven background so it sits inside cards and panes.
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

  return (
    <div
      className={`not-prose group/code overflow-hidden border border-white/[0.06] ${className ?? ''}`}
      style={{ background: 'oklch(0.145 0 0)' }}
    >
      {hasHeader && (
        <CodeHeader
          filename={filename}
          language={language}
          code={clean}
          actions={actions}
        />
      )}
      <Highlight code={clean} language={language} theme={themes.vsDark}>
        {({ className: prismClass, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`overflow-auto p-0 text-[0.8125rem] leading-[1.7] tracking-[-0.01em] ${prismClass}`}
            style={{ background: 'transparent' }}
          >
            <code className="block min-w-fit py-4 font-mono">
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line });
                const fileLine = startLineNumber + i;
                const isHot = highlight.has(fileLine);
                return (
                  <div
                    key={i}
                    {...lineProps}
                    className={`flex pr-6 pl-5 ${lineProps.className ?? ''} ${
                      isHot
                        ? 'bg-amber-300/[0.07] shadow-[inset_2px_0_0_0_rgba(251,191,36,0.5)]'
                        : ''
                    }`}
                  >
                    {showLineNumbers && (
                      <span
                        className="mr-5 shrink-0 select-none text-right text-zinc-700 tabular-nums transition-colors group-hover/code:text-zinc-600"
                        style={{ width: gutterWidth }}
                      >
                        {fileLine}
                      </span>
                    )}
                    <span className="flex-1">
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
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
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
      <span className="flex shrink-0 gap-1.5" aria-hidden>
        <span className="size-3 rounded-full bg-white/[0.08]" />
        <span className="size-3 rounded-full bg-white/[0.08]" />
        <span className="size-3 rounded-full bg-white/[0.08]" />
      </span>
      {filename ? (
        <span
          className="min-w-0 flex-1 truncate text-center font-mono text-xs text-zinc-500"
          title={filename}
        >
          {filename}
        </span>
      ) : (
        <span className="flex-1 font-mono text-[0.6875rem] font-medium tracking-widest text-zinc-600 uppercase">
          {language}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
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
