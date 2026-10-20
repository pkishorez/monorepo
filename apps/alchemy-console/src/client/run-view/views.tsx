import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kestack/web-platform/components/alert';
import { Badge } from '@kestack/web-platform/components/badge';
import { Button } from '@kestack/web-platform/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@kestack/web-platform/components/collapsible';
import {
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  CircleMinusIcon,
  CircleXIcon,
  ExternalLinkIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { urlOf } from '../../shared/contracts/project/index.ts';
import type {
  Run,
  RunPhase,
  RunStatus,
} from '../../shared/contracts/run/index.ts';
import type { Progress, ResourceRow } from './resources.ts';

/*
 * A run, drawn: its outcome first, then its steps, the resources of its
 * plan each ticking from waiting to done, and its log, closed until asked.
 * Every part keeps its height while it fills in, so nothing below moves.
 */

const STATUS: Readonly<Record<RunStatus, string>> = {
  queued: 'Queued',
  inspecting: 'Reading the stack',
  planning: 'Planning',
  applying: 'Applying',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  lost: 'Lost',
};

const PHASE: Readonly<Record<RunPhase, string>> = {
  cloning: 'Check out the commit',
  setup: 'Install dependencies',
  inspecting: 'Read the stack',
  planning: 'Plan the changes',
  applying: 'Apply them',
};

const PHASES_OF: Readonly<Record<Run['kind'], ReadonlyArray<RunPhase>>> = {
  inspect: ['cloning', 'setup', 'inspecting'],
  deploy: ['cloning', 'setup', 'inspecting', 'planning', 'applying'],
  destroy: ['cloning', 'setup', 'inspecting', 'planning', 'applying'],
};

const KIND: Readonly<Record<Run['kind'], string>> = {
  inspect: 'Inspect',
  deploy: 'Deploy',
  destroy: 'Destroy',
};

const statusVariant = (status: RunStatus) =>
  status === 'failed' || status === 'lost'
    ? ('destructive' as const)
    : status === 'succeeded'
      ? ('default' as const)
      : ('secondary' as const);

const RESOURCE_WORDS: Readonly<Record<Progress, string>> = {
  waiting: 'Waiting',
  working: '',
  done: '',
  failed: 'Failed',
  unchanged: 'Unchanged',
};

function ProgressIcon({ progress }: { readonly progress: Progress }) {
  switch (progress) {
    case 'waiting':
      return (
        <CircleDashedIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      );
    case 'working':
      return <Spinner aria-hidden className="size-4 shrink-0" />;
    case 'done':
      return (
        <CircleCheckIcon
          aria-hidden
          className="size-4 shrink-0 text-positive"
        />
      );
    case 'failed':
      return (
        <CircleXIcon aria-hidden className="size-4 shrink-0 text-destructive" />
      );
    case 'unchanged':
      return (
        <CircleMinusIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      );
  }
}

// Skeleton rows and real ones alike, so nothing moves when the plan comes.
const ROW = 'flex min-h-14 items-center gap-3 px-4 py-2';

function ResourceRows({
  resources,
}: {
  readonly resources: ReadonlyArray<ResourceRow> | null;
}) {
  if (resources === null)
    return (
      <ul
        aria-busy
        aria-label="The plan's resources, once it is ready"
        className="divide-y divide-border rounded-lg border border-border"
      >
        {[0, 1, 2].map((key) => (
          <li key={key} className={ROW}>
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-16" />
          </li>
        ))}
      </ul>
    );
  if (resources.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        The stack has no resources.
      </p>
    );
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {resources.map((row) => (
        <li key={row.fqn} className={ROW}>
          <ProgressIcon progress={row.progress} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{row.logicalId}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.resourceType}
            </span>
          </div>
          <span
            className={`shrink-0 text-sm ${row.progress === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {RESOURCE_WORDS[row.progress] || row.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Steps({
  run,
  phases,
}: {
  readonly run: Run;
  readonly phases: ReadonlyArray<RunPhase>;
}) {
  const all = PHASES_OF[run.kind];
  const ended = run.status !== 'queued' && run.finishedAt !== null;
  const current = phases.at(-1);
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {all.map((phase) => {
        const begun = phases.includes(phase);
        const working = begun && phase === current && !ended;
        const failed =
          begun && phase === current && ended && run.status !== 'succeeded';
        return (
          <li key={phase} className="flex items-center gap-2">
            {failed ? (
              <CircleXIcon
                aria-hidden
                className="size-4 shrink-0 text-destructive"
              />
            ) : working ? (
              <Spinner aria-hidden className="size-4 shrink-0" />
            ) : begun ? (
              <CircleCheckIcon
                aria-hidden
                className="size-4 shrink-0 text-positive"
              />
            ) : (
              <CircleIcon
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground/50"
              />
            )}
            <span className={begun ? '' : 'text-muted-foreground'}>
              {PHASE[phase]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const shortSha = (sha: string) => sha.slice(0, 7);

const durationOf = (run: Run) => {
  if (run.startedAt === null || run.finishedAt === null) return null;
  const seconds = Math.max(
    1,
    Math.round((run.finishedAt - run.startedAt) / 1000),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** The outcome's place, the same height before the run ends as after. */
const OUTCOME =
  'flex min-h-19 flex-col justify-center gap-1 rounded-lg border border-border px-4 py-3';

const PENDING: Readonly<Record<Run['kind'], string>> = {
  inspect: 'What the stack is appears here once it’s read.',
  deploy: 'The stage’s URL appears here once it’s live.',
  destroy: 'This says so here once the stage is gone.',
};

function Outcome({ run }: { readonly run: Run }) {
  const result = run.result;
  if (result === null)
    return (
      <div className={OUTCOME}>
        <span className="text-sm text-muted-foreground">
          {PENDING[run.kind]}
        </span>
      </div>
    );
  if (result._tag === 'Deployed') {
    const url = urlOf(result.outputs);
    return url === null ? (
      <div className={OUTCOME}>
        <span className="text-sm text-muted-foreground">
          Deployed. The stack exports no URL.
        </span>
      </div>
    ) : (
      <div className={OUTCOME}>
        <span className="text-sm text-muted-foreground">Live at</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={url}
          className="flex min-w-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          <span className="truncate">{url.replace(/^https:\/\//, '')}</span>
          <ExternalLinkIcon aria-hidden className="size-4 shrink-0" />
        </a>
      </div>
    );
  }
  if (result._tag === 'Failed')
    return (
      <Alert variant="destructive" className="min-h-19">
        <AlertTitle>
          {run.status === 'lost' ? 'The run was lost' : 'The run failed'}
        </AlertTitle>
        <AlertDescription className="break-words">
          {result.message}
        </AlertDescription>
      </Alert>
    );
  if (result._tag === 'Cancelled')
    return (
      <div className={OUTCOME}>
        <span className="text-sm text-muted-foreground">It was cancelled.</span>
      </div>
    );
  return (
    <div className={OUTCOME}>
      <span className="text-sm text-muted-foreground">
        Read {result.inspect.stackName}.
      </span>
    </div>
  );
}

export function RunBody({
  run,
  phases,
  resources,
  lines,
  logOpen,
  onLogToggled,
}: {
  readonly run: Run;
  readonly phases: ReadonlyArray<RunPhase>;
  readonly resources: ReadonlyArray<ResourceRow> | null;
  readonly lines: ReadonlyArray<string>;
  readonly logOpen: boolean;
  readonly onLogToggled: (open: boolean) => void;
}) {
  const duration = durationOf(run);
  const changing = resources?.filter((row) => row.progress !== 'unchanged');
  const done = changing?.filter((row) => row.progress === 'done').length ?? 0;
  return (
    <section
      aria-label={`${KIND[run.kind]} to ${run.stage}`}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">
            {KIND[run.kind]} to {run.stage}
          </h2>
          <Badge variant={statusVariant(run.status)} aria-live="polite">
            {STATUS[run.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {run.repo}
          {run.folder === '.' ? '' : `/${run.folder}`} at{' '}
          <span className="font-mono">{shortSha(run.commit)}</span>
          {duration === null ? '' : ` · ${duration}`}
        </p>
      </header>
      <Outcome run={run} />
      <Steps run={run} phases={phases} />
      {run.kind !== 'inspect' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-medium">Resources</h3>
            {changing !== undefined && changing.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {done} of {changing.length} done
              </span>
            )}
          </div>
          <ResourceRows resources={resources} />
        </div>
      )}
      <Collapsible open={logOpen} onOpenChange={onLogToggled}>
        <CollapsibleTrigger
          render={<Button variant="ghost" className="-ml-2.5 gap-1.5" />}
        >
          <ChevronRightIcon
            aria-hidden
            className={`size-4 transition-transform duration-150 ${logOpen ? 'rotate-90' : ''}`}
          />
          {logOpen ? 'Hide log' : 'Show log'}
          <span className="text-muted-foreground tabular-nums">
            ({lines.length} {lines.length === 1 ? 'line' : 'lines'})
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
            {lines.length === 0 ? 'Nothing written yet.' : lines.join('\n')}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/** A run before its first word: shaped like a Deploy, part for part. */
export function RunSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-19 w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-5 w-44" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-24" />
        <ResourceRows resources={null} />
      </div>
      <Skeleton className="h-9 w-36" />
    </div>
  );
}
