import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { Button } from '@monorepo/frontend/components/ui/button';
import { cn } from '@monorepo/frontend/lib/utils';
import { formatMoney } from '../money/index.ts';

export interface StatusLine {
  readonly id: string;
  readonly phase: 'sending' | 'refused' | 'failed';
  readonly message: string | null;
  readonly amount: number;
  readonly counterpartyName: string;
  readonly attempt: number;
}

export function TransferStatus({
  lines,
  onRetry,
  onDismiss,
}: {
  lines: readonly StatusLine[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const visible = lines
    .filter((line) => line.phase !== 'sending' || line.attempt > 1)
    .sort((a, b) => a.id.localeCompare(b.id));
  const problems = visible.filter((line) => line.phase !== 'sending');
  const failed = visible.filter((line) => line.phase === 'failed');

  const label =
    problems.length > 0
      ? `${problems.length} transfer${problems.length === 1 ? '' : 's'} failed`
      : 'Retrying…';

  useEffect(() => {
    if (visible.length === 0) setExpanded(false);
  }, [visible.length]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-5">
      <AnimatePresence>
        {visible.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ borderRadius: 16 }}
            className="pointer-events-auto w-80 max-w-full overflow-hidden border bg-background shadow-lg"
          >
            {expanded ? (
              <>
                <div className="flex h-9 items-center justify-between gap-2 border-b py-1 pr-1.5 pl-3">
                  <motion.p layout="position" className="text-xs font-medium">
                    {label}
                  </motion.p>
                  <div className="flex items-center gap-0.5">
                    {failed.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          failed.forEach((line) => onRetry(line.id))
                        }
                        className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                      >
                        <RotateCcw className="size-3" />
                        Retry all
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Collapse"
                      onClick={() => setExpanded(false)}
                      className="size-6 p-0 text-muted-foreground"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <ul className="max-h-56 overflow-y-auto p-1">
                  <AnimatePresence initial={false}>
                    {visible.map((line) => (
                      <StatusRow
                        key={line.id}
                        line={line}
                        onRetry={onRetry}
                        onDismiss={onDismiss}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex h-9 w-full items-center gap-2 px-3.5 text-xs font-medium"
              >
                <span className="relative flex size-2">
                  {problems.length > 0 && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex size-2 rounded-full',
                      problems.length > 0
                        ? 'bg-destructive'
                        : 'bg-muted-foreground',
                    )}
                  />
                </span>
                <motion.span layout="position">{label}</motion.span>
                <ChevronUp className="ml-auto size-3.5 text-muted-foreground" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusRow({
  line,
  onRetry,
  onDismiss,
}: {
  line: StatusLine;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const retrying = line.phase === 'sending';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="flex h-12 items-center gap-2.5 rounded-lg py-1 pr-0.5 pl-2">
        {retrying ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <CircleAlert className="size-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {formatMoney(line.amount)} to {line.counterpartyName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {retrying ? 'Retrying…' : (line.message ?? 'Didn’t go through')}
          </p>
        </div>
        {!retrying && (
          <>
            {line.phase === 'failed' && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Retry"
                onClick={() => onRetry(line.id)}
                className="size-7 p-0 text-muted-foreground"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Dismiss"
              onClick={() => onDismiss(line.id)}
              className="size-7 p-0 text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </motion.li>
  );
}
