import { Check, CircleAlert, LoaderCircle } from 'kui-toolkit/lucide';
import type { analysisEvent } from '../../../shared/contracts/delete-stage/index.ts';

export type Analysis = {
  id: string;
  type: string;
  status: 'analyzing' | 'analyzed' | 'failed';
};

export type PreviewFailure = { id: string | null; message: string };

export const applyAnalysis = (
  current: readonly Analysis[],
  event: typeof analysisEvent.Type,
): Analysis[] => {
  const status = event.kind === 'analyzing' ? 'analyzing' : 'analyzed';
  const index = current.findIndex((entry) => entry.id === event.id);
  if (index === -1)
    return [...current, { id: event.id, type: event.type, status }];
  return current.map((entry, i) =>
    i === index ? { ...entry, type: event.type, status } : entry,
  );
};

export const resetAnalysis = (current: readonly Analysis[]): Analysis[] =>
  current.map((entry) => ({ ...entry, status: 'analyzing' }));

export const markFailed = (
  current: readonly Analysis[],
  id: string | null,
): Analysis[] =>
  current.map((entry) =>
    entry.id === id ? { ...entry, status: 'failed' } : entry,
  );

export function AnalysisView({
  entries,
  failure,
  pending,
}: {
  entries: readonly Analysis[];
  failure: PreviewFailure | null;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      {!!entries.length && (
        <ul
          aria-label="Resource analysis"
          className="divide-y rounded-md border"
        >
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 p-3">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {entry.status === 'failed' ? (
                  <CircleAlert className="size-4 text-destructive" />
                ) : entry.status === 'analyzed' ? (
                  <Check className="size-4" />
                ) : (
                  <LoaderCircle className="size-4 motion-safe:animate-spin" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{entry.id}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.type}
                </p>
              </div>
              <span
                className={`w-20 shrink-0 text-right text-xs ${entry.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {entry.status === 'failed'
                  ? 'Failed'
                  : entry.status === 'analyzed'
                    ? 'Done'
                    : 'Analyzing…'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        role={failure ? 'alert' : 'status'}
        className="min-h-[4.5rem] space-y-1 text-sm"
      >
        {failure ? (
          <>
            <p className="font-medium text-destructive">
              {failure.id
                ? `Planning stopped at ${failure.id}.`
                : 'Planning could not finish.'}
            </p>
            <p className="text-destructive">{failure.message}</p>
            <p className="text-muted-foreground">
              Nothing was deleted. Fix the cause and retry, or close this
              dialog.
            </p>
          </>
        ) : pending ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            Preparing the deletion plan…
          </p>
        ) : null}
      </div>
    </div>
  );
}
