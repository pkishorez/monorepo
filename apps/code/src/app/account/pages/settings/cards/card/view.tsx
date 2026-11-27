import {
  type Connection as ConnectionSchema,
  DISPLAY_NAME_MAX,
} from '@kestack/connect/cloud';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  CircleAlertIcon,
  LockIcon,
  MonitorIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import * as Confirm from '../../../../../../ui/controls/notice/index.ts';
import { statusOf } from '../../../../connection/link/index.ts';
import {
  ConnectionNotice,
  StandingDot,
  standingOf,
  useBehind,
  useLock,
} from '../../../../connection/link/index.ts';
import { CardLive } from './actor.ts';
import { Agents } from './agents/index.ts';
import { Speech } from './speech/index.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * One Connection's card: its Display Name, else its Computer Name, whole,
 * with its Computer Name under a Display Name, so two of one Display Name
 * are told apart; and one quiet line of how it
 * stands, its dot and its Link and Last Seen as the sidebar says them,
 * with a lock once its settings are said to be locked; on a wider screen
 * its tunnel and the version of Connect it runs under it; beside it
 * Rename, a quiet pencil, which turns its name into a field, saved with
 * Enter and left with Escape, which takes a name even while the Connection is
 * out of reach, as Connect Cloud keeps it; and Forget, a quiet bin that
 * turns the danger colour under the pointer, which the list asks first; while its code Plugin is Updating or stopped,
 * or its `ke-connect` is out of date, what to know and do about it; and
 * its Agents, each between rules: its agents' accounts and its Speech to
 * Text switch, each as its Connection's setup holds it, so one that does
 * not answer says so in its own place.
 */

/** A Connection's name on its card: its Display Name, else its Computer Name, whole. */
const titleOf = (connection: Connection) =>
  connection.displayName ?? connection.name;

const BUTTON = 'h-11 keyboard:h-8';

const ICON_BUTTON =
  '-mt-1 size-11 text-muted-foreground keyboard:mt-0 keyboard:size-8';

/** A Connection's name, whole, its Computer Name under a Display Name, and how it stands. */
function ConnectionHead({ connection }: { readonly connection: Connection }) {
  const { health, said } = useLock(connection.id);
  const standing = standingOf(health, connection);
  const details = `${statusOf(connection.status)} · Connect ${connection.version}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
        {titleOf(connection)}
      </h3>
      {connection.displayName !== null && (
        <p
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          title="Computer Name"
        >
          <MonitorIcon aria-label="Computer Name" className="size-3 shrink-0" />
          <span className="[overflow-wrap:anywhere]">{connection.name}</span>
        </p>
      )}
      <p
        className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        title={details}
      >
        <StandingDot kind={standing.kind} />
        <span className="truncate">{standing.label}</span>
        {said && (
          <LockIcon
            aria-label="Its settings can't be changed until it is back"
            className="size-3 shrink-0"
          />
        )}
      </p>
      <p className="hidden truncate text-xs text-muted-foreground/80 tabular-nums sm:block">
        {details}
      </p>
    </div>
  );
}

/** Its Display Name being changed: a field in place of its name, and Save and Cancel. */
function RenameForm({
  connection,
  text,
  saving,
  problem,
  onType,
  onSave,
  onCancel,
}: {
  readonly connection: Connection;
  readonly text: string;
  readonly saving: boolean;
  readonly problem: string | null;
  readonly onType: (text: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const id = `connection-${connection.id}-display-name`;
  return (
    <form
      noValidate
      className="flex min-w-0 flex-1 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex max-w-xl min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          Display Name
        </label>
        <Input
          id={id}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={connection.name}
          value={text}
          disabled={saving}
          aria-invalid={problem !== null}
          aria-describedby={`${id}-hint${problem === null ? '' : ` ${id}-problem`}`}
          onChange={(event) => onType(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }}
          className="h-11 min-w-0 text-base keyboard:h-9 keyboard:md:text-sm md:text-base"
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Leave empty to use its Computer Name.
        </p>
      </div>
      {problem !== null && (
        <p
          id={`${id}-problem`}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={BUTTON} disabled={saving}>
          {saving && <Spinner />}
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={BUTTON}
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export const CardView = View.make(
  CardLive,
  ({ root, model, props, children, send }) => {
    const open = Confirm.useOpen();
    const { connection } = props;
    const { renaming } = model;
    const behind = useBehind(connection.id);
    const title = titleOf(connection);
    return (
      <li
        {...root}
        className="flex flex-col rounded-xl border border-border/60"
      >
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
          {renaming !== null ? (
            <RenameForm
              connection={connection}
              text={renaming.text}
              saving={renaming.saving}
              problem={renaming.problem}
              onType={(text) => send({ _tag: 'NameTyped', text })}
              onSave={() => send({ _tag: 'RenameSaved' })}
              onCancel={() => send({ _tag: 'RenameCancelled' })}
            />
          ) : (
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <ConnectionHead connection={connection} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`${ICON_BUTTON} hover:text-foreground`}
                aria-label={`Rename ${title}`}
                title={`Rename ${title}`}
                onClick={() => send({ _tag: 'RenameAsked' })}
              >
                <PencilIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`${ICON_BUTTON} -mr-2 hover:bg-destructive/10 hover:text-destructive keyboard:mr-0`}
                aria-label={`Forget ${title}`}
                title={`Forget ${title}…`}
                onClick={() => open(() => send({ _tag: 'ForgetAsked' }))}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          )}
          <ConnectionNotice connection={connection} behind={behind} />
        </div>
        <div className="flex flex-col divide-y divide-border *:px-4 *:py-4 sm:*:px-5">
          <Agents.view instance={children.agents} />
          <Speech.view instance={children.speech} />
        </div>
      </li>
    );
  },
);
