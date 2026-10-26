import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import {
  ChevronRightIcon,
  CircleAlertIcon,
  LockIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useState } from 'react';
import { Path, tilde } from '../../../../../../ui/path/index.ts';
import { useLock } from '../../../../../machines/index.ts';
import { CardLive, formOf } from './actor.ts';

/*
 * One account's row (`Row`), which the list draws and opens the card from:
 * its name, marked Default for its agent's Default Account, and one quiet
 * line, the config folder it really runs with, cut in its middle so its
 * end shows, marked when it is Connect's environment's, not one set here,
 * and the version that runs; or why it does not run, such as
 * how to install the agent. While the Machine's Line is not connected the
 * row takes no tap, a lock in place of its arrow once that is said.
 *
 * The card itself is its form: name, config folder and binary, each with a
 * short hint of what empty means, the folder an empty one really runs
 * with, why the Machine refused, and for a new
 * account how to sign in with its folder; then Save and Cancel, and for an
 * added account Remove, apart, which asks again. While the Line is not
 * connected it takes nothing.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

/** What the user calls an agent, such as "Claude". */
export const agentName = (harness: HarnessAccountInfo['harness']) =>
  AGENT[harness];

/** Each agent's own config folder, the variable an account's folder is set as, and how to sign in with it. */
const FOLDER = {
  claude: {
    own: '~/.claude',
    variable: 'CLAUDE_CONFIG_DIR',
    signIn: 'claude',
  },
  codex: { own: '~/.codex', variable: 'CODEX_HOME', signIn: 'codex login' },
} as const;

const BUTTON = 'h-11 keyboard:h-8';

function Field({
  id,
  label,
  hint,
  value,
  placeholder,
  disabled,
  mono,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly mono?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
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
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`h-11 min-w-0 text-base keyboard:h-9 md:text-base ${mono ? 'font-mono keyboard:md:text-[13px]' : 'keyboard:md:text-sm'}`}
      />
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

type Used = NonNullable<HarnessAccountInfo['resolvedConfigFolder']>;

/** The config folder it really runs with, as its Machine says, else as set or the agent's own. */
const usedOf = (account: HarnessAccountInfo): Used =>
  account.resolvedConfigFolder ??
  (account.configFolder === null
    ? { path: FOLDER[account.harness].own, from: 'default' }
    : { path: account.configFolder, from: 'account' });

/** Where a config folder in use came from, when it is not one set here. */
const fromOf = (used: Used) =>
  used.from === 'environment'
    ? `${used.variable} in Connect's environment`
    : null;

/** The version a binary reports, as its number alone, such as "2.1.310". */
const versionOf = (version: string) =>
  /\d+(?:\.\d+)+/.exec(version)?.[0] ?? version;

/** The row's name, Default tag and quiet line. */
function Summary({ account }: { readonly account: HarnessAccountInfo }) {
  const { resolved } = account;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <span data-slot="account-name" className="truncate text-sm font-medium">
          {account.name}
        </span>
        {account.isDefault && <Badge variant="secondary">Default</Badge>}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Path value={tilde(usedOf(account).path)} />
        {fromOf(usedOf(account)) !== null && (
          <span
            className="shrink-0"
            title={fromOf(usedOf(account)) ?? undefined}
          >
            · from environment
          </span>
        )}
        {resolved.error === null && resolved.version !== null && (
          <span className="shrink-0 tabular-nums" title={resolved.version}>
            · {versionOf(resolved.version)}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * An account's row, or the account being added's when `account` is null:
 * tapped, it opens its card or closes it, `expanded` saying it is open
 * below it.
 */
export function Row({
  account,
  harness,
  expanded,
  controls,
  disabled,
  said,
  onToggle,
}: {
  readonly account: HarnessAccountInfo | null;
  readonly harness: HarnessAccountInfo['harness'];
  readonly expanded: boolean;
  /** The id of what it opens. */
  readonly controls: string;
  readonly disabled: boolean;
  /** Whether the Machine is said to be out of reach: a lock for the arrow. */
  readonly said: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label={
          account === null ? `New ${AGENT[harness]} account` : account.name
        }
        aria-expanded={expanded}
        aria-controls={controls}
        disabled={disabled}
        className="focus-ring -mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted active:bg-muted disabled:hover:bg-transparent"
        onClick={onToggle}
      >
        {account === null ? (
          <span
            data-slot="account-name"
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            New {AGENT[harness]} account
          </span>
        ) : (
          <Summary account={account} />
        )}
        {said ? (
          <LockIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
              expanded && 'rotate-90',
            )}
          />
        )}
      </button>
      {account !== null && account.resolved.error !== null && (
        <p className="flex items-start gap-2 pb-2 text-sm text-destructive">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{account.resolved.error}</span>
        </p>
      )}
    </div>
  );
}

/** Remove, apart from Save and Cancel; tapped, it asks again in its place. */
function RemoveButton({
  name,
  disabled,
  onRemove,
}: {
  readonly name: string;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button
        type="button"
        variant="destructive"
        className={`ml-auto ${BUTTON}`}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        Remove…
      </Button>
    );
  return (
    <div
      role="group"
      aria-label={`Remove ${name}?`}
      className="flex basis-full flex-wrap items-center gap-2 border-t border-border pt-3"
    >
      <p className="mr-auto text-sm text-muted-foreground">
        Remove {name}? Its sessions stop working.
      </p>
      <Button
        type="button"
        variant="ghost"
        className={BUTTON}
        onClick={() => setAsking(false)}
      >
        Keep
      </Button>
      <Button
        type="button"
        variant="destructive"
        className={BUTTON}
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

export const CardView = View.make(CardLive, ({ root, model, props, send }) => {
  const { locked } = useLock(model.machineId);
  const { account } = props;
  const { harness } = model;
  const folder = FOLDER[harness];
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
  const resolved =
    account === null || account.binaryPath !== null
      ? ''
      : account.resolved.path === null
        ? ', not found'
        : `, now ${account.resolved.path}`;
  const typedFolder = form.configFolder.trim();
  // What an empty folder runs with: this Machine's, when it is known.
  const empty = props.empty === null ? folder.own : tilde(props.empty.path);
  const fromEnvironment = props.empty?.from === 'environment';
  const off = model.busy || locked;
  return (
    <form
      {...root}
      noValidate
      aria-describedby={model.problem ? `${id}-problem` : undefined}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        send({ _tag: 'Save' });
      }}
    >
      <div className="flex max-w-xl flex-col gap-4">
        <Field
          id={`${id}-name-field`}
          label="Name"
          value={form.name}
          placeholder={`${AGENT[harness]} work`}
          disabled={off}
          onChange={edit('name')}
        />
        <Field
          id={`${id}-config-folder`}
          label="Config folder"
          hint={`${folder.variable} · empty = ${empty}${fromEnvironment ? ", from Connect's environment" : ''}`}
          value={form.configFolder}
          placeholder={empty}
          disabled={off}
          mono
          onChange={edit('configFolder')}
        />
        <Field
          id={`${id}-binary`}
          label="Binary"
          hint={`Empty = from PATH${resolved}`}
          value={form.binaryPath}
          placeholder={harness}
          disabled={off}
          mono
          onChange={edit('binaryPath')}
        />
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
        account === null && (
          <p className="text-xs text-muted-foreground">
            Sign in with a new folder on the Machine first:{' '}
            <code className="font-mono break-all">
              {folder.variable}={typedFolder === '' ? '<folder>' : typedFolder}{' '}
              {folder.signIn}
            </code>
          </p>
        )
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={BUTTON} disabled={off || !changed}>
          {model.busy && <Spinner />}
          {account === null ? 'Add account' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={BUTTON}
          disabled={model.busy}
          onClick={() => send({ _tag: 'Cancel' })}
        >
          Cancel
        </Button>
        {account !== null && !account.isDefault && (
          <RemoveButton
            name={account.name}
            disabled={off}
            onRemove={() => send({ _tag: 'Remove' })}
          />
        )}
      </div>
    </form>
  );
});
