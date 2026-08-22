import { Match } from 'effect';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';

export type LastEventLine =
  | { readonly kind: 'refused'; readonly id: string; readonly message: string }
  | { readonly kind: 'failed'; readonly id: string; readonly message: string }
  | { readonly kind: 'retrying'; readonly id: string };

export function LastEvent({
  line,
  onRetry,
}: {
  line: LastEventLine | null;
  onRetry: (id: string) => void;
}) {
  return (
    <div className="relative h-5 text-xs">
      <AnimatePresence initial={false} mode="wait">
        {line !== null && (
          <motion.p
            key={`${line.kind}-${line.id}`}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 truncate text-muted-foreground"
          >
            {Match.value(line).pipe(
              Match.when({ kind: 'refused' }, (r) => (
                <span className="text-destructive">Refused — {r.message}</span>
              )),
              Match.when({ kind: 'failed' }, (f) => (
                <>
                  {f.message}{' '}
                  <button
                    type="button"
                    onClick={() => onRetry(f.id)}
                    className="text-foreground underline underline-offset-4 outline-none hover:text-primary focus-visible:text-primary"
                  >
                    Retry
                  </button>
                </>
              )),
              Match.when({ kind: 'retrying' }, () => <>Retrying…</>),
              Match.exhaustive,
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
