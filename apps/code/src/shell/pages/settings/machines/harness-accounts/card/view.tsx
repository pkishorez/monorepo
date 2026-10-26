import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import {
  ChevronRightIcon,
  CircleAlertIcon,
  LockIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useLock } from '../../../../../machines/index.ts';
import { CardLive, formOf } from './actor.ts';

/*
 * One account's row, tapped to change it: its name, marked Default for its
 * agent's Default Account, and one quiet line, its config folder, or the
 * agent's own, cut in its middle so its end shows, and the version that
 * runs; or why it does not run, such as how to install the agent. Opened,
 * its form: name, config folder and binary, each saying what empty means,
 * why the Machine refused, else how to sign in with the folder, then Save
 * and Cancel, and Remove for an added account, which asks again. The
 * account being added is its form alone. While the Machine's Line is not
 * connected the row takes no tap, a lock in place of its arrow once that
 * is said, and an open form takes nothing.
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

type Self = ViewProps<typeof CardLive>;

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

/** A path cut in its middle, so its last part always shows. */
function Path({ value }: { readonly value: string }) {
  const at = value.lastIndexOf('/', value.length - 2) + 1;
  return (
    <span className="flex min-w-0 font-mono" title={value}>
      <span className="truncate">{value.slice(0, at)}</span>
      <span className="shrink-0">{value.slice(at)}</span>
    </span>
  );
}

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
        <Path value={account.configFolder ?? FOLDER[account.harness].own} />
        {resolved.error === null && resolved.version !== null && (
          <span className="shrink-0 tabular-nums" title={resolved.version}>
            · {versionOf(resolved.version)}
          </span>
        )}
      </span>
    </span>
  );
}

/** Cancel; and for an added account, Remove, asked twice. */
function Actions({
  model,
  props,
  send,
  locked,
}: Pick<Self, 'model' | 'props' | 'send'> & { readonly locked: boolean }) {
  const cancel = (
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
  const { account } = props;
  if (account === null || account.isDefault) return cancel;
  if (!model.confirmingRemove)
    return (
      <>
        {cancel}
        <Button
          type="button"
          variant="ghost"
          className={`ml-auto text-muted-foreground hover:text-destructive ${BUTTON}`}
          disabled={model.busy || locked}
          onClick={() => send({ _tag: 'RemoveAsked' })}
        >
          Remove…
        </Button>
      </>
    );
  return (
    <>
      {cancel}
      <span className="ml-auto text-sm text-muted-foreground">
        Its sessions stop working.
      </span>
      <Button
        type="button"
        variant="destructive"
        className={BUTTON}
        disabled={locked}
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
  const { locked, said } = useLock(model.machineId);
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
  const open = model.editing || model.problem !== null || account === null;
  const binary =
    account === null
      ? ''
      : account.binaryPath === null
        ? account.resolved.path === null
          ? ', not found on PATH'
          : `, now ${account.resolved.path}`
        : '';
  const typedFolder = form.configFolder.trim();
  const row =
    'flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left';
  return (
    <section
      {...root}
      aria-label={account?.name ?? `New ${AGENT[harness]} account`}
      className="-mx-2 flex flex-col gap-2"
    >
      {account === null ? (
        <div className={row}>
          <span data-slot="account-name" className="text-sm font-medium">
            New {AGENT[harness]} account
          </span>
        </div>
      ) : open ? (
        <div className={row}>
          <Summary account={account} />
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Change ${account.name}`}
          disabled={locked}
          className={`focus-ring ${row} transition-colors duration-150 hover:bg-muted active:bg-muted disabled:hover:bg-transparent`}
          onClick={() => send({ _tag: 'EditAsked' })}
        >
          <Summary account={account} />
          {said ? (
            <LockIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : (
            <ChevronRightIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
        </button>
      )}
      {account !== null && account.resolved.error !== null && (
        <p className="flex items-start gap-2 px-2 text-sm text-destructive">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{account.resolved.error}</span>
        </p>
      )}
      {open && (
        <form
          noValidate
          className="flex flex-col gap-3 px-2 pb-3"
          aria-describedby={model.problem ? `${id}-problem` : `${id}-hint`}
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
              disabled={model.busy || locked}
              onChange={edit('name')}
            />
            <Field
              id={`${id}-config-folder`}
              label="Config folder"
              hint={`Empty uses ${folder.own}, ${AGENT[harness]}'s own. Set as ${folder.variable}.`}
              value={form.configFolder}
              placeholder={folder.own}
              disabled={model.busy || locked}
              mono
              onChange={edit('configFolder')}
            />
            <Field
              id={`${id}-binary`}
              label="Binary"
              hint={`Empty runs ${harness} from PATH${binary}.`}
              value={form.binaryPath}
              placeholder={`${harness} from PATH`}
              disabled={model.busy || locked}
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
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0"
              />
              {model.problem}
            </p>
          ) : (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              A new folder? Sign in on the Machine first:{' '}
              <code className="font-mono break-all">
                {folder.variable}=
                {typedFolder === '' ? '<folder>' : typedFolder} {folder.signIn}
              </code>
              . Sessions started after saving use it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              className={BUTTON}
              disabled={model.busy || locked || !changed}
            >
              {model.busy && <Spinner />}
              {account === null ? 'Add account' : 'Save'}
            </Button>
            <Actions model={model} props={props} send={send} locked={locked} />
          </div>
        </form>
      )}
    </section>
  );
});
