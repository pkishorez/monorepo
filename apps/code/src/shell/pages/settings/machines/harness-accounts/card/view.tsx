import type { HarnessAccountInfo } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Locked, useHealth } from '../../../../../machines/index.ts';
import { CardLive, formOf } from './actor.ts';

/*
 * One account's row: its name and the version that runs, then the path,
 * marked Custom when it is not the agent's default, its config folder when
 * it has one, or why it does not run, such as how to install the agent.
 * "Change" opens its form: name, config folder and binary as typed, why
 * the Machine refused, else a hint, then Save and Cancel, and Remove for
 * an added account, which asks again. The account being added is its
 * form alone. While the Machine's Line is not connected, a lock and why
 * stand in place of "Change", and an open form takes nothing.
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

const BUTTON = 'h-11 keyboard:h-8';

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

function Summary({ account }: { readonly account: HarnessAccountInfo }) {
  const { resolved } = account;
  return (
    <>
      <div className="flex min-w-0 items-baseline gap-2">
        <h4 className="truncate text-sm font-medium">{account.name}</h4>
        {resolved.error === null && resolved.version !== null && (
          <span
            className="truncate text-xs text-muted-foreground tabular-nums"
            title={resolved.version}
          >
            {resolved.version}
          </span>
        )}
      </div>
      <p
        title={resolved.path ?? undefined}
        className="truncate font-mono text-xs text-muted-foreground"
      >
        {!resolved.isDefault && (
          <span className="font-sans font-medium text-foreground">
            Custom ·{' '}
          </span>
        )}
        {resolved.path ?? 'No binary found'}
      </p>
      {account.configFolder !== null && (
        <p
          title={account.configFolder}
          className="truncate font-mono text-xs text-muted-foreground"
        >
          {account.configFolder}
        </p>
      )}
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
  return (
    <section
      {...root}
      aria-label={account?.name ?? `New ${AGENT[harness]} account`}
      className="flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {account === null ? (
            <h4 className="text-sm font-medium">
              New {AGENT[harness]} account
            </h4>
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
          <div className="flex flex-wrap gap-3">
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
              value={form.configFolder}
              placeholder={`${FOLDER[harness].own} (its own)`}
              disabled={model.busy || locked}
              mono
              onChange={edit('configFolder')}
            />
            <Field
              id={`${id}-binary`}
              label="Binary"
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
              A config folder is set as {FOLDER[harness].variable}; sign in with
              it first. The Machine runs the binary with --version before
              saving. Sessions started after a change use it.
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
