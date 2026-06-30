import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { CheckIcon, CopyIcon } from '@monorepo/frontend/lucide';

const COMMAND = 'npx @kishorez/devtools@latest';

/**
 * A hint showing the one-liner that starts a local DevTools server, with a
 * copy button. Shown wherever the user might need to spin one up (the
 * not-connected screen and the connection dialog).
 */
export function CommandHint() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Don't have a server running? Start one with:
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {COMMAND}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Copy command"
          aria-label="Copy command"
          onClick={copy}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
