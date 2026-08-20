import { Button } from '@monorepo/frontend/components/ui/button';
import { Spinner } from '@monorepo/frontend/components/ui/spinner';

export interface StatusLine {
  readonly id: string;
  readonly phase: 'sending' | 'refused' | 'failed';
  readonly message: string | null;
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
  const sending = lines.filter((line) => line.phase === 'sending').length;
  const problems = lines.filter((line) => line.phase !== 'sending');
  const problem = problems[problems.length - 1];

  return (
    <div
      role="status"
      className="flex h-14 min-w-0 flex-col items-end justify-center gap-1 text-right"
    >
      <p className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        {sending > 0 && (
          <>
            <Spinner className="size-3 shrink-0" />
            {sending === 1 ? 'Sending…' : `Sending ${sending}…`}
          </>
        )}
      </p>
      <div className="flex h-7 items-center gap-1">
        {problem !== undefined && (
          <>
            <span className="truncate text-xs text-destructive">
              {problem.message ?? ''}
              {problems.length > 1 && ` (+${problems.length - 1})`}
            </span>
            {problem.phase === 'failed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRetry(problem.id)}
                className="h-7 px-2.5 text-xs"
              >
                Retry
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(problem.id)}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
