import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { ScrollArea } from '#components/ui/scroll-area';

import type { FeatureRules } from '../../model';

type FeatureRulesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string | null;
  rules: FeatureRules | null;
};

/**
 * Shows the rules configured for the selected feature as pretty-printed JSON —
 * the source-of-truth view behind the canvas. Copy button lifts the JSON to the
 * clipboard for sharing or pasting into an AI chat.
 */
export function FeatureRulesDialog({
  open,
  onOpenChange,
  feature,
  rules,
}: FeatureRulesDialogProps) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(
    () => (rules ? JSON.stringify(rules, null, 2) : ''),
    [rules],
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Configured rules</span>
            {feature && (
              <span className="rounded-full border border-primary/60 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {feature}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            What this feature owns and consumes, as configured — the source of
            truth behind the canvas.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] rounded-md border border-border bg-muted/30">
          <pre className="p-4 font-mono text-xs leading-relaxed text-foreground">
            {json}
          </pre>
        </ScrollArea>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!json}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
