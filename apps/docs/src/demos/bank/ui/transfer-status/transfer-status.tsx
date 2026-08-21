import { Button } from '@monorepo/frontend/components/ui/button';

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
  const problems = lines.filter((line) => line.phase !== 'sending');
  const problem = problems[problems.length - 1];

  return (
    <div
      role="status"
      className="flex h-7 min-w-0 items-center justify-end text-right"
    >
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
