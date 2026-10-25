import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import {
  CircleAlertIcon,
  CircleCheckIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { CardLive, formOf } from './actor.ts';

/*
 * One account's card: its name, and what runs now (the path, and its
 * version or why it does not run, such as how to install the agent); then
 * its name, config folder and binary as typed, Save, and under them why
 * the Machine refused, else a hint. An added account has Remove, which
 * asks again; the one being added has Cancel.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

/** What the user calls an agent, such as "Claude". */
export const agentName = (harness: HarnessAccountInfo['harness']) =>
  AGENT[harness];

/** Each agent's own config folder, and the variable an account's folder is set as. */
const FOLDER = {
  claude: { own: '~/.claude', variable: 'CLAUDE_CONFIG_DIR' },
  codex: { own: '~/.codex', variable: 'CODEX_HOME' },
} as const;

type Self = ViewProps<typeof CardLive>;

const BUTTON = 'h-11 keyboard:h-9';

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

/** Cancel for the account being added; Remove, asked twice, for an added one. */
function Actions({
  model,
  props,
  send,
}: Pick<Self, 'model' | 'props' | 'send'>) {
  const { account } = props;
  if (account === null)
    return (
      <Button
        type="button"
        variant="ghost"
        className={BUTTON}
        disabled={model.busy}
        onClick={() => send({ _tag: 'Cancel' })}
      >
        Cancel
      </Button>
    );
  if (account.isDefault) return null;
  if (!model.confirmingRemove)
    return (
      <Button
        type="button"
        variant="ghost"
        className={BUTTON}
        disabled={model.busy}
        onClick={() => send({ _tag: 'RemoveAsked' })}
      >
        Remove…
      </Button>
    );
  return (
    <>
      <span className="text-sm text-muted-foreground">
        Its sessions stop working.
      </span>
      <Button
        type="button"
        variant="destructive"
        className={BUTTON}
        onClick={() => send({ _tag: 'Remove' })}
      >
        Remove
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={BUTTON}
        onClick={() => send({ _tag: 'RemoveKept' })}
      >
        Keep
      </Button>
    </>
  );
}

export const CardView = View.make(CardLive, ({ root, model, props, send }) => {
  const { account } = props;
  const { harness } = model;
  const id = `account-${model.machineId}-${model.key}`;
  const form = formOf(model, props);
  const changed =
    account === null ||
    form.name.trim() !== account.name ||
    form.binaryPath.trim() !== (account.binaryPath ?? '') ||
    form.configFolder.trim() !== (account.configFolder ?? '');
  const edit =
    (field: 'name' | 'binaryPath' | 'configFolder') => (value: string) =>
      send({ _tag: 'Edited', field, value });
  return (
    <section
      {...root}
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
        aria-describedby={model.problem ? `${id}-problem` : `${id}-hint`}
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'Save' });
        }}
      >
        <div className="flex flex-wrap gap-3">
          <Field
            id={`${id}-name-field`}
            label="Name"
            value={form.name}
            placeholder={`${AGENT[harness]} work`}
            disabled={model.busy}
            onChange={edit('name')}
          />
          <Field
            id={`${id}-config-folder`}
            label="Config folder"
            value={form.configFolder}
            placeholder={`${FOLDER[harness].own} (its own)`}
            disabled={model.busy}
            mono
            onChange={edit('configFolder')}
          />
          <Field
            id={`${id}-binary`}
            label="Binary"
            value={form.binaryPath}
            placeholder={`${harness} from PATH`}
            disabled={model.busy}
            mono
            onChange={edit('binaryPath')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            className={BUTTON}
            disabled={model.busy || !changed}
          >
            {model.busy && <Spinner />}
            {account === null ? 'Add account' : 'Save'}
          </Button>
          <Actions model={model} props={props} send={send} />
        </div>
        {model.problem !== null ? (
          <p
            id={`${id}-problem`}
            role="alert"
            className="flex items-start gap-1.5 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {model.problem}
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
});
