import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { CheckIcon, CopyIcon } from '@kstackz/ui-toolkit/lucide';
import { type ReactNode, useEffect, useState } from 'react';

// Just enough TSX colouring to read a snippet: comments, strings, keywords,
// numbers, JSX tag names and hooks. Everything else stays plain.
const TOKEN =
  /(?<comment>\/\/[^\n]*)|(?<string>'[^'\n]*'|"[^"\n]*"|`[^`]*`)|(?<keyword>\b(?:import|from|export|const|let|function|return|await|async|new|true|false|undefined|null|if|else|type)\b)|(?<number>\b\d+(?:\.\d+)?\b)|(?<tag><\/?[A-Za-z][\w.]*)|(?<hook>\buse[A-Z]\w*)/g;

const CLASS: Record<string, string> = {
  comment: 'text-(--code-comment) italic',
  string: 'text-(--code-string)',
  keyword: 'text-(--code-keyword)',
  number: 'text-(--code-number)',
  tag: 'text-(--code-tag)',
  hook: 'text-(--code-hook)',
};

const highlight = (code: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const index = match.index;
    if (index > last) out.push(code.slice(last, index));
    const kind = Object.entries(match.groups ?? {}).find(
      ([, v]) => v !== undefined,
    )?.[0];
    out.push(
      <span key={index} className={kind === undefined ? '' : CLASS[kind]}>
        {match[0]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
};

/** A snippet with a copy button. Pass the code the page's controls describe. */
export function Code(props: {
  readonly code: string;
  /** What the snippet is, shown above it: a file name or an import. */
  readonly title?: string;
  readonly testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-muted/40 ring-1 ring-foreground/10">
      <figcaption className="flex h-10 items-center justify-between gap-2 border-b border-border pr-1 pl-4">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {props.title ?? 'Code'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 pointer-coarse:size-11"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() =>
            void navigator.clipboard
              .writeText(props.code)
              .then(() => setCopied(true))
          }
        >
          {copied ? (
            <CheckIcon aria-hidden="true" className="text-positive" />
          ) : (
            <CopyIcon aria-hidden="true" />
          )}
        </Button>
      </figcaption>
      <pre
        data-testid={props.testId}
        className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed [font-variant-ligatures:none] [tab-size:2]"
      >
        <code>{highlight(props.code)}</code>
      </pre>
    </figure>
  );
}
