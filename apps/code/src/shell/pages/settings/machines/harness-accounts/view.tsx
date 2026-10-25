import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  PlusIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { ago } from '../../../../../ui/time/index.ts';
import { outOfReach } from '../../../../../layer/capabilities/index.ts';
import { useHealth } from '../../../../machines/index.ts';
import { formOf, HarnessAccountsLive, NEW } from './actor.ts';

/*
 * One Machine's agent accounts, one card each: its name, the binary it
 * runs and the config folder it keeps its login in. A card says what runs
 * now (the path, and its version or why it does not run, such as how to
 * install the agent). A change is saved only once the Machine has run the
 * binary and found the folder; a refusal shows under the card, which keeps
 * what was typed. Under the cards, a button per agent adds another login.
 * An added account is removed once asked again. Until they are read, a
 * quiet skeleton of the cards while the Machine answers, and, while it
 * does not, a line that says so.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

/** Each agent's own config folder, and the variable an account's folder is set as. */
const FOLDER = {
  claude: { own: '~/.claude', variable: 'CLAUDE_CONFIG_DIR' },
  codex: { own: '~/.codex', variable: 'CODEX_HOME' },
} as const;

type Self = ViewProps<typeof HarnessAccountsLive>;
type Harness = HarnessAccountInfo['harness'];

function Field({
  id,
  label,
  value,
  placeholder,
  disabled,
  mono,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly mono?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`h-11 min-w-0 text-base keyboard:h-9 md:text-base ${mono ? 'font-mono keyboard:md:text-[13px]' : 'keyboard:md:text-sm'}`}
      />
    </div>
  );
}

function Resolved({
  resolved,
}: {
  readonly resolved: HarnessAccountInfo['resolved'];
}) {
  return (
    <>
      <p
        title={resolved.path ?? undefined}
        className="truncate font-mono text-xs text-muted-foreground"
      >
        {resolved.path ?? 'No binary found'}
      </p>
      {resolved.error !== null && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{resolved.error}</span>
        </p>
      )}
    </>
  );
}

function Card({
  cardKey,
  harness,
  account,
  model,
  send,
}: Pick<Self, 'model' | 'send'> & {
  readonly cardKey: string;
  readonly harness: Harness;
  /** null for the account being added. */
  readonly account: HarnessAccountInfo | null;
}) {
  const id = `account-${model.machineId}-${cardKey}`;
  const form = formOf(model, cardKey);
  const problem = model.problems[cardKey] ?? null;
  const saving = model.saving === cardKey;
  const changed =
    account === null ||
    form.name.trim() !== account.name ||
    form.binaryPath.trim() !== (account.binaryPath ?? '') ||
    form.home.trim() !== (account.home ?? '');
  const edit = (field: 'name' | 'binaryPath' | 'home') => (value: string) =>
    send({ _tag: 'Edited', key: cardKey, field, value });
  return (
    <section
      aria-labelledby={`${id}-name`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 id={`${id}-name`} className="truncate text-sm font-semibold">
            {account?.name ?? `New ${AGENT[harness]} account`}
          </h3>
          {account?.isDefault === true ? (
            <Badge variant="secondary">Default</Badge>
          ) : (
            <Badge variant="outline">{AGENT[harness]}</Badge>
          )}
          {account !== null &&
            account.resolved.error === null &&
            account.resolved.version !== null && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <CircleCheckIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-positive"
                />
                <span className="truncate" title={account.resolved.version}>
                  {account.resolved.version}
                </span>
              </span>
            )}
        </div>
        {account !== null && <Resolved resolved={account.resolved} />}
      </div>
      <form
        noValidate
        className="flex flex-col gap-3"
        aria-describedby={problem ? `${id}-problem` : `${id}-hint`}
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'Save', key: cardKey });
        }}
      >
        <div className="flex flex-wrap gap-3">
          <Field
            id={`${id}-name-field`}
            label="Name"
            value={form.name}
            placeholder={`${AGENT[harness]} work`}
            disabled={saving}
            onChange={edit('name')}
          />
          <Field
            id={`${id}-home`}
            label="Config folder"
            value={form.home}
            placeholder={`${FOLDER[harness].own} (its own)`}
            disabled={saving}
            mono
            onChange={edit('home')}
          />
          <Field
            id={`${id}-binary`}
            label="Binary"
            value={form.binaryPath}
            placeholder={`${harness} from PATH`}
            disabled={saving}
            mono
            onChange={edit('binaryPath')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            className="h-11 keyboard:h-9"
            disabled={model.saving !== null || !changed}
          >
            {saving && <Spinner />}
            {account === null ? 'Add account' : 'Save'}
          </Button>
          {account === null ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 keyboard:h-9"
              disabled={saving}
              onClick={() => send({ _tag: 'AddCancelled' })}
            >
              Cancel
            </Button>
          ) : account.isDefault ? null : model.removing === account.id ? (
            <>
              <span className="text-sm text-muted-foreground">
                Its sessions stop working.
              </span>
              <Button
                type="button"
                variant="destructive"
                className="h-11 keyboard:h-9"
                onClick={() => send({ _tag: 'Remove', id: account.id })}
              >
                Remove
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 keyboard:h-9"
                onClick={() => send({ _tag: 'RemoveKept' })}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-11 keyboard:h-9"
              disabled={model.saving !== null}
              onClick={() => send({ _tag: 'RemoveAsked', id: account.id })}
            >
              Remove…
            </Button>
          )}
        </div>
        {problem !== null ? (
          <p
            id={`${id}-problem`}
            role="alert"
            className="flex items-start gap-1.5 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {problem}
          </p>
        ) : (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            A config folder is set as {FOLDER[harness].variable}; sign in with
            it first. The Machine runs the binary with --version before saving.
            Sessions started after a change use it.
          </p>
        )}
      </form>
    </section>
  );
}

export const HarnessAccountsView = View.make(
  HarnessAccountsLive,
  ({ root, model, send }) => {
    const health = useHealth(model.machineId);
    return (
      <div {...root} className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Agents</h3>
          <p className="text-sm text-muted-foreground">
            The agents installed on this Machine, one card per login. Add
            another login, such as a work account, with its own config folder.
          </p>
        </header>
        {model.loadProblem !== null ? (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {model.loadProblem}
            <Button
              variant="link"
              size="xs"
              type="button"
              onClick={() => send({ _tag: 'Retry' })}
            >
              Try again
            </Button>
          </p>
        ) : model.accounts === null ? (
          outOfReach(health) ? (
            <p role="status" className="text-sm text-muted-foreground">
              Not answering, last seen {ago(health.lastSeen)}. Its agents show
              here once it is back.
            </p>
          ) : (
            <div className="flex flex-col gap-4" aria-busy>
              {['claude', 'codex'].map((name) => (
                <div
                  key={name}
                  className="flex flex-col gap-4 rounded-xl border border-border p-5"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {model.accounts.map((account) => (
              <Card
                key={account.id}
                cardKey={account.id}
                harness={account.harness}
                account={account}
                model={model}
                send={send}
              />
            ))}
            {model.adding !== null ? (
              <Card
                cardKey={NEW}
                harness={model.adding}
                account={null}
                model={model}
                send={send}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...new Set(model.accounts.map(({ harness }) => harness))].map(
                  (harness) => (
                    <Button
                      key={harness}
                      type="button"
                      variant="outline"
                      className="h-11 keyboard:h-9"
                      disabled={model.saving !== null}
                      onClick={() => send({ _tag: 'AddAsked', harness })}
                    >
                      <PlusIcon aria-hidden />
                      Add a {AGENT[harness]} account
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
