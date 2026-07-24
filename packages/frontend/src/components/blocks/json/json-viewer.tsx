import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '#components/ui/button';
import { CheckIcon, CopyIcon } from '#lib/lucide';
import { JsonEditor } from './json-editor';

export type JsonViewerProps = {
  value: unknown;
  label?: string;
  maxHeight?: string;
};

/** Read-only JSON view with a copy-to-clipboard button. */
export function JsonViewer({
  value,
  label,
  maxHeight = '400px',
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = () => {
    void navigator.clipboard.writeText(json);
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex min-h-8 items-center justify-between border-b px-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          title="Copy JSON"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <JsonEditor
        value={json}
        readOnly
        maxHeight={maxHeight}
        className="rounded-none border-0"
      />
    </div>
  );
}
