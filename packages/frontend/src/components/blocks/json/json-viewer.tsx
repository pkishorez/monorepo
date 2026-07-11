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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-muted-foreground text-xs font-medium">
            {label}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          title="Copy to clipboard"
          className="ml-auto"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <JsonEditor value={json} readOnly maxHeight={maxHeight} />
    </div>
  );
}
