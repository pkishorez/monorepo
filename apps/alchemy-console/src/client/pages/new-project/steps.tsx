import { Router } from '@kestack/kabuki/routing';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kestack/web-platform/components/alert';
import { Button } from '@kestack/web-platform/components/button';
import { Input } from '@kestack/web-platform/components/input';
import { Label } from '@kestack/web-platform/components/label';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleIcon,
  FolderIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
} from '@kestack/web-platform/components/lucide';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/components/native-select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@kestack/web-platform/components/radio-group';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type {
  CredentialSummary,
  Provider,
} from '../../../shared/contracts/credential/index.ts';
import type { Repository } from '../../../shared/contracts/github/index.ts';
import { SUPPORTED_PROVIDERS } from '../../../shared/contracts/project/index.ts';
import type {
  InspectResult,
  RunPhase,
} from '../../../shared/contracts/run/index.ts';
import { router } from '../../../shared/pages/index.ts';

/*
 * New project's steps, drawn. Each has one primary action, at the foot of
 * the step, and a quiet way back. A list still on the way is drawn as rows
 * of its own height, so nothing moves when it comes.
 */

type Step =
  | 'PickRepo'
  | 'ChooseFolder'
  | 'Inspecting'
  | 'Providers'
  | 'Deploying';

const STEPS: ReadonlyArray<{ readonly step: Step; readonly title: string }> = [
  { step: 'PickRepo', title: 'Pick a repository' },
  { step: 'ChooseFolder', title: 'Choose its folder' },
  { step: 'Inspecting', title: 'Reading the stack' },
  { step: 'Providers', title: 'Deploy to Production' },
];

const numberOf = (step: Step) =>
  step === 'Deploying' ? 4 : STEPS.findIndex((each) => each.step === step) + 1;

export function StepHeader({ step }: { readonly step: Step }) {
  const number = numberOf(step);
  return (
    <header className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground tabular-nums">
        New project · Step {number} of {STEPS.length}
      </p>
      <h1
        id="new-project-title"
        className="text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {STEPS[number - 1]!.title}
      </h1>
    </header>
  );
}

function Back({
  onBack,
  disabled,
}: {
  readonly onBack: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Button variant="ghost" onClick={onBack} disabled={disabled}>
      <ArrowLeftIcon aria-hidden />
      Back
    </Button>
  );
}

function Problem({ problem }: { readonly problem: string | null }) {
  if (problem === null) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {problem}
    </p>
  );
}

const LIST = 'divide-y divide-border rounded-lg border border-border';
const ROW = 'flex min-h-14 items-center gap-3 px-4 py-2';

function RowsSkeleton({ rows }: { readonly rows: number }) {
  return (
    <ul aria-busy className={LIST}>
      {Array.from({ length: rows }, (_, key) => (
        <li key={key} className={ROW}>
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-48 max-w-full" />
        </li>
      ))}
    </ul>
  );
}

export function PickRepoStep({
  repositories,
  query,
  onQuery,
  onPick,
}: {
  readonly repositories: ReadonlyArray<Repository> | null;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly onPick: (target: {
    readonly connectionId: string;
    readonly repo: string;
    readonly defaultBranch: string;
  }) => void;
}) {
  const wanted = query.trim().toLowerCase();
  const shown = (repositories ?? [])
    .filter((repository) => repository.fullName.toLowerCase().includes(wanted))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="repository-search">Repository</Label>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="repository-search"
            type="search"
            className="pl-9"
            placeholder="Search your repositories"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      </div>
      {repositories === null ? (
        <RowsSkeleton rows={3} />
      ) : repositories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Your GitHub connections reach no repositories yet. Give Console access
          to one in{' '}
          <Router.Link
            to={router.Console.Settings()}
            className="underline underline-offset-4"
          >
            Settings
          </Router.Link>
          .
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No repository matches “{query.trim()}”.
        </p>
      ) : (
        <ul className={LIST} aria-label="Repositories">
          {shown.map((repository) => (
            <li key={`${repository.connectionId}/${repository.fullName}`}>
              <button
                type="button"
                className={`${ROW} w-full text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset`}
                onClick={() =>
                  onPick({
                    connectionId: repository.connectionId,
                    repo: repository.fullName,
                    defaultBranch: repository.defaultBranch,
                  })
                }
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {repository.fullName}
                </span>
                {repository.private && (
                  <LockIcon
                    aria-label="Private"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChooseFolderStep({
  repo,
  folders,
  folder,
  busy,
  problem,
  onPick,
  onInspect,
  onBack,
}: {
  readonly repo: string;
  readonly folders: ReadonlyArray<string> | null;
  readonly folder: string | null;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onPick: (folder: string) => void;
  readonly onInspect: () => void;
  readonly onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted-foreground">
        Folders of <span className="font-medium text-foreground">{repo}</span>{' '}
        holding an alchemy.run.ts. Console reads the stack in the one you
        choose.
      </p>
      {folders === null && problem === null ? (
        <RowsSkeleton rows={1} />
      ) : folders !== null && folders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No folder of {repo} holds an alchemy.run.ts on its default branch.
          Pick another repository.
        </p>
      ) : folders !== null ? (
        <RadioGroup
          aria-label="Folder"
          value={folder ?? ''}
          onValueChange={(value) => onPick(String(value))}
          className={`${LIST} gap-0`}
        >
          {folders.map((each) => (
            <Label
              key={each}
              className={`${ROW} cursor-pointer font-normal hover:bg-muted/50`}
            >
              <RadioGroupItem value={each} />
              <FolderIcon
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {each === '.' ? `${repo.split('/')[1]} (root)` : each}
              </span>
            </Label>
          ))}
        </RadioGroup>
      ) : null}
      <Problem problem={problem} />
      <div className="flex items-center justify-between gap-3">
        <Back onBack={onBack} />
        <Button
          onClick={onInspect}
          disabled={folder === null || busy || folders === null}
        >
          Inspect
        </Button>
      </div>
    </div>
  );
}

const PHASES: ReadonlyArray<{
  readonly phase: RunPhase;
  readonly words: string;
}> = [
  { phase: 'cloning', words: 'Check out the default branch' },
  { phase: 'setup', words: 'Install dependencies' },
  { phase: 'inspecting', words: 'Read the stack' },
];

export function InspectingStep({
  repo,
  folder,
  phase,
  lines,
  problem,
  busy,
  onRetry,
  onBack,
}: {
  readonly repo: string;
  readonly folder: string;
  readonly phase: RunPhase | null;
  readonly lines: ReadonlyArray<string>;
  readonly problem: string | null;
  readonly busy: boolean;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  const at =
    phase === null ? -1 : PHASES.findIndex((each) => each.phase === phase);
  const last = lines.at(-1);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-pretty text-muted-foreground">
        Console checks out{' '}
        <span className="font-medium text-foreground">
          {repo}
          {folder === '.' ? '' : `/${folder}`}
        </span>{' '}
        in a fresh container and reads its stack with the project’s own Alchemy.
        Nothing is deployed yet.
      </p>
      <ol className="flex flex-col gap-2.5 text-sm" aria-live="polite">
        {PHASES.map((each, index) => {
          const done = index < at;
          const working = index === at && problem === null;
          return (
            <li key={each.phase} className="flex items-center gap-2">
              {done ? (
                <CircleCheckIcon
                  aria-hidden
                  className="size-4 shrink-0 text-positive"
                />
              ) : working ? (
                <Spinner aria-hidden className="size-4 shrink-0" />
              ) : (
                <CircleIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground/50"
                />
              )}
              <span className={done || working ? '' : 'text-muted-foreground'}>
                {each.words}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="min-h-5 truncate font-mono text-xs text-muted-foreground">
        {problem === null ? (last ?? 'Starting a container…') : ''}
      </p>
      {problem !== null && (
        <Alert variant="destructive">
          <AlertTitle>Console couldn’t read this stack</AlertTitle>
          <AlertDescription className="break-words">{problem}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-3">
        <Back onBack={onBack} />
        {problem !== null && (
          <Button onClick={onRetry} disabled={busy}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

const LABEL: Readonly<Record<string, string>> = {
  cloudflare: 'Cloudflare',
  aws: 'AWS',
};
const labelOf = (provider: string) => LABEL[provider] ?? provider;

function Fact({
  term,
  value,
}: {
  readonly term: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

export function DeployStep({
  repo,
  folder,
  branch,
  inspect,
  credentials,
  choices,
  busy,
  problem,
  ready,
  onChoose,
  onAdd,
  onDeploy,
  onBack,
}: {
  readonly repo: string;
  readonly folder: string;
  readonly branch: string;
  readonly inspect: InspectResult;
  readonly credentials: ReadonlyArray<CredentialSummary> | null;
  readonly choices: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly ready: boolean;
  readonly onChoose: (provider: string, credentialId: string) => void;
  readonly onAdd: (provider: Provider) => void;
  readonly onDeploy: () => void;
  readonly onBack: () => void;
}) {
  const cloudflareState = inspect.stateStore === 'cloudflare';
  const unsupported = inspect.providers.filter(
    (provider) => !SUPPORTED_PROVIDERS.includes(provider),
  );
  return (
    <div className="flex flex-col gap-6">
      <dl className={LIST}>
        <Fact term="Stack" value={inspect.stackName} />
        <Fact
          term="From"
          value={`${repo}${folder === '.' ? '' : `/${folder}`} · ${branch}`}
        />
        <Fact
          term="State"
          value={
            inspect.stateStore === 'cloudflare'
              ? 'Cloudflare'
              : inspect.stateStore.other
          }
        />
        <Fact
          term="Providers"
          value={inspect.providers.map(labelOf).join(', ') || 'None'}
        />
        <Fact term="Alchemy" value={inspect.alchemyVersion} />
      </dl>
      {!cloudflareState && (
        <Alert variant="destructive">
          <AlertTitle>Console can’t deploy this stack yet</AlertTitle>
          <AlertDescription>
            It keeps its state outside Cloudflare. Use `Cloudflare.state()` in
            its alchemy.run.ts, then inspect it again.
          </AlertDescription>
        </Alert>
      )}
      {unsupported.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Console can’t hand it every credential</AlertTitle>
          <AlertDescription>
            It also uses {unsupported.join(', ')}, which Console has no
            credentials for yet.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-4">
        {inspect.providers
          .filter((provider) => SUPPORTED_PROVIDERS.includes(provider))
          .map((provider) => {
            const fitting = (credentials ?? []).filter(
              (credential) => credential.provider === provider,
            );
            const id = `credential-${provider}`;
            return (
              <div key={provider} className="flex flex-col gap-2">
                <Label htmlFor={id}>{labelOf(provider)} credential</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {credentials === null ? (
                    <Skeleton className="h-9 w-full sm:flex-1" />
                  ) : (
                    <NativeSelect
                      id={id}
                      className="w-full sm:flex-1"
                      value={choices[provider] ?? ''}
                      disabled={busy}
                      // 16px, so iOS doesn't zoom in on it.
                      style={{ fontSize: 16 }}
                      onChange={(event) =>
                        onChoose(provider, event.target.value)
                      }
                    >
                      <NativeSelectOption value="" disabled>
                        {fitting.length === 0
                          ? `No ${labelOf(provider)} credential yet`
                          : `Pick a ${labelOf(provider)} credential`}
                      </NativeSelectOption>
                      {fitting.map((credential) => (
                        <NativeSelectOption
                          key={credential.credentialId}
                          value={credential.credentialId}
                        >
                          {credential.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => onAdd(provider as Provider)}
                  >
                    <PlusIcon aria-hidden />
                    New {labelOf(provider)} credential
                  </Button>
                </div>
              </div>
            );
          })}
      </div>
      <Problem problem={problem} />
      <div className="flex items-center justify-between gap-3">
        <Back onBack={onBack} disabled={busy} />
        <Button onClick={onDeploy} disabled={!ready || busy}>
          {busy && <Spinner aria-hidden />}
          Deploy to Production
        </Button>
      </div>
    </div>
  );
}
