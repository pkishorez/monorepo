import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Option, Schema } from 'effect';
import { TestValueSchema, type TestValue } from 'laymos/report';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '#components/ui/button';
import { CheckIcon, CopyIcon } from '#lib/lucide';

import { JsonViewer } from '../json';

const TestValueObjectSchema = Schema.Record(Schema.String, TestValueSchema);

export function AutoValue({
  value,
  detectCode = true,
  label,
}: {
  readonly value: TestValue;
  readonly detectCode?: boolean;
  readonly label?: string;
}) {
  if (Array.isArray(value) || isRecord(value)) {
    return <JsonViewer value={value} label={label} maxHeight="20rem" />;
  }
  const frame = (content: ReactNode) =>
    label ? (
      <CopyableValue label={label} value={value}>
        {content}
      </CopyableValue>
    ) : (
      content
    );
  if (typeof value !== 'string') {
    return frame(<code className="text-xs">{String(value)}</code>);
  }
  const parsed = parseJson(value);
  if (parsed !== undefined) {
    return <JsonViewer value={parsed} label={label} maxHeight="20rem" />;
  }
  if (looksLikeMarkdown(value)) {
    return frame(
      <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>,
    );
  }
  if (detectCode && looksLikeCode(value)) {
    return frame(<HighlightedCode code={value} />);
  }
  return frame(
    <span className="whitespace-pre-wrap break-words text-xs">{value}</span>,
  );
}

function CopyableValue({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: TestValue;
  readonly children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = () => {
    const text =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    void navigator.clipboard.writeText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/10">
      <div className="flex min-h-8 items-center justify-between border-b px-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          title={`Copy ${label.toLocaleLowerCase()}`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function HighlightedCode({ code }: { readonly code: string }) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let active = true;
    void import('shiki')
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang: 'typescript',
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
  }, [code]);

  if (html === undefined) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="[&_.shiki]:overflow-x-auto [&_.shiki]:rounded-md [&_.shiki]:bg-muted/20! [&_.shiki]:p-3 [&_.shiki]:text-xs dark:[&_.shiki_span]:text-[var(--shiki-dark)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseJson(value: string): TestValue | undefined {
  if (!value.trim().startsWith('{') && !value.trim().startsWith('[')) {
    return undefined;
  }
  try {
    const decoded = Schema.decodeUnknownOption(TestValueSchema)(
      JSON.parse(value),
    );
    return Option.getOrUndefined(decoded);
  } catch {
    return undefined;
  }
}

function looksLikeMarkdown(value: string): boolean {
  return /(^|\n)(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/m.test(value);
}

function looksLikeCode(value: string): boolean {
  return (
    value.includes('\n') &&
    /\b(import|export|const|let|function|return|interface|type)\b|=>/.test(
      value,
    )
  );
}

function isRecord(
  value: TestValue,
): value is { readonly [key: string]: TestValue } {
  return Option.isSome(
    Schema.decodeUnknownOption(TestValueObjectSchema)(value),
  );
}
