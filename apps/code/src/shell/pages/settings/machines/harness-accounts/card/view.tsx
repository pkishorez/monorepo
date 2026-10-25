import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Locked, useHealth } from '../../../../../machines/index.ts';
import { CardLive, formOf } from './actor.ts';

/*
 * One account's row: its name, marked Default for its agent's Default
 * Account, and the version that runs; then its config folder, or the
 * agent's own, and its binary, the path set or the one found on PATH; or
 * why it does not run, such as how to install the agent. "Change" opens
 * its form: name, config folder and binary, each saying what empty means,
 * why the Machine refused, else how to sign in with the folder, then Save
 * and Cancel, and Remove for an added account, which asks again. The
 * account being added is its form alone. While the Machine's Line is not
 * connected, a lock and why stand in place of "Change", and an open form
 * takes nothing.
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

/** One line of the summary: a quiet label, and its value in mono, then what it means in plain words. */
function Line({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate" title={value}>
        <span className="font-mono">{value}</span>
        {note !== undefined && (
          <span className="text-muted-foreground"> · {note}</span>
        )}
      </dd>
    </>
  );
}

function Summary({ account }: { readonly account: HarnessAccountInfo }) {
  const { resolved } = account;
  const folder = FOLDER[account.harness];
  return (
    <>
      <div className="flex min-w-0 items-baseline gap-2">
        <h5 className="truncate text-sm font-medium">{account.name}</h5>
        {account.isDefault && (
          <span className="shrink-0 text-xs text-muted-foreground">
            Default
          </span>
        )}
        {resolved.error === null && resolved.version !== null && (
          <span
            className="ml-auto truncate text-xs text-muted-foreground tabular-nums"
            title={resolved.version}
          >
            {resolved.version}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        {account.configFolder === null ? (
          <Line label="Config folder" value={folder.own} note="its own" />
        ) : (
          <Line
            label="Config folder"
            value={account.configFolder}
            note={folder.variable}
          />
        )}
        {account.binaryPath === null ? (
          <Line
            label="Binary"
            value={resolved.path ?? account.harness}
            note={resolved.path === null ? 'not on PATH' : 'from PATH'}
          />
        ) : (
          <Line label="Binary" value={resolved.path ?? account.binaryPath} />
        )}
      </dl>
      {resolved.error !== null && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{resolved.error}</span>
        </p>
      )}
    </>
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
  const health = useHealth(model.machineId);
  const locked = health._tag !== 'Connected';
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
  const fromPath =
    account?.binaryPath === null && account.resolved.path !== null
      ? `, now ${account.resolved.path}`
      : '';
  const typedFolder = form.configFolder.trim();
  return (
    <section
      {...root}
      aria-label={account?.name ?? `New ${AGENT[harness]} account`}
      className="flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {account === null ? (
            <h5 className="text-sm font-medium">
              New {AGENT[harness]} account
            </h5>
          ) : (
            <Summary account={account} />
          )}
        </div>
        {locked ? (
          <Locked health={health} />
        ) : (
          !open && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Change ${account.name}`}
              className="-my-1 h-11 shrink-0 text-muted-foreground keyboard:h-8"
              onClick={() => send({ _tag: 'EditAsked' })}
            >
              Change
            </Button>
          )
        )}
      </div>
      {open && (
        <form
          noValidate
          className="flex flex-col gap-3"
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
              hint={`Empty runs ${harness} from PATH${fromPath}.`}
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
              Sign in with a new folder first, on the Machine:{' '}
              <code className="font-mono">
                {folder.variable}=
                {typedFolder === '' ? '<folder>' : typedFolder} {folder.signIn}
              </code>
              . The Machine runs the binary with --version before saving;
              sessions started after a change use it.
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
