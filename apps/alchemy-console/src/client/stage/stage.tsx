import { Router } from '@kestack/kabuki/routing';
import { Badge } from '@kestack/web-platform/components/badge';
import { ExternalLinkIcon } from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import {
  type Stage,
  type StageStatus,
  urlOf,
} from '../../shared/contracts/project/index.ts';
import { router } from '../../shared/pages/index.ts';

/*
 * A stage, as a card: where it stands, its URL once it has one, the commit
 * it runs, and its latest run. Shared by the project page and the projects
 * list, so a stage reads the same everywhere.
 */

const WORDS: Readonly<Record<StageStatus, string>> = {
  deploying: 'Deploying',
  live: 'Live',
  'deploy-failed': 'Deploy failed',
  destroying: 'Destroying',
  'destroy-failed': 'Destroy failed',
};

export function StageBadge({ status }: { readonly status: StageStatus }) {
  const working = status === 'deploying' || status === 'destroying';
  return (
    <Badge
      variant={
        status === 'live'
          ? 'default'
          : status.endsWith('failed')
            ? 'destructive'
            : 'secondary'
      }
    >
      {working && <Spinner aria-hidden className="size-3" />}
      {WORDS[status]}
    </Badge>
  );
}

/** The stage's URL, on one line whatever its length; a line saying so until it has one. */
export function StageUrl({ stage }: { readonly stage: Stage }) {
  const url = urlOf(stage.outputs);
  if (url === null)
    return (
      <p className="min-h-5 truncate text-sm text-muted-foreground">
        {stage.status === 'deploying'
          ? 'Its URL appears once it’s live.'
          : 'No URL yet.'}
      </p>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="relative z-10 flex min-h-5 min-w-0 items-center gap-1.5 text-sm underline-offset-4 hover:underline"
    >
      <span className="truncate">{url.replace(/^https:\/\//, '')}</span>
      <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}

export function StageCard({
  projectId,
  stage,
}: {
  readonly projectId: string;
  readonly stage: Stage | null;
}) {
  return (
    <section
      aria-labelledby="production-title"
      className="flex flex-col gap-3 rounded-lg border border-border px-4 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="production-title" className="font-medium">
          Production
        </h2>
        {stage !== null && <StageBadge status={stage.status} />}
      </div>
      {stage === null ? (
        <p className="text-sm text-muted-foreground">Not deployed yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <StageUrl stage={stage} />
          <p className="text-sm text-muted-foreground">
            Stage <span className="font-mono">{stage.name}</span>
            {stage.lastDeployedCommit === null ? (
              ''
            ) : (
              <>
                {' '}
                at{' '}
                <span className="font-mono">
                  {stage.lastDeployedCommit.slice(0, 7)}
                </span>
              </>
            )}
            {stage.lastRunId !== null && (
              <>
                {' · '}
                <Router.Link
                  to={router.Console.Project.Run({
                    projectId,
                    runId: stage.lastRunId,
                  })}
                  className="underline underline-offset-4"
                >
                  Latest run
                </Router.Link>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
