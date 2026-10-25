import type { HarnessBinary } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useEffect, useState } from 'react';
import { ago } from '../../../../../ui/time/index.ts';
import { outOfReach } from '../../../../../layer/capabilities/index.ts';
import { useHealth } from '../../../../machines/index.ts';
import { HarnessBinariesLive } from './actor.ts';

/*
 * One Machine's agents' binaries, a row each: the agent, the version that
 * runs, and the path, marked Custom when it is not the agent's default, or
 * why it does not run. "Change" opens a field for the path; a path typed
 * is saved only once the Machine has run it, which closes the field, and a
 * refusal shows under it, which keeps what was typed. "Use default"
 * forgets the path set. Until they are read, a quiet skeleton of the rows
 * while the Machine answers, and, while it does not, a line that says so.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

type Self = ViewProps<typeof HarnessBinariesLive>;

function Binary({
  binary: { harness, configuredPath, resolved },
  model,
  send,
}: Pick<Self, 'model' | 'send'> & { readonly binary: HarnessBinary }) {
  const id = `binary-${model.machineId}-${harness}`;
  const problem = model.problems[harness] ?? null;
  const saving = model.saving === harness;
  const value = model.drafts[harness] ?? configuredPath ?? '';
  const changed = value.trim() !== (configuredPath ?? '');
  const [editing, setEditing] = useState(false);
  // A path saved, or forgotten, closes the field.
  useEffect(() => setEditing(false), [configuredPath]);
  const open = editing || problem !== null;
  const close = () => {
    setEditing(false);
    send({ _tag: 'Typed', harness, path: configuredPath ?? '' });
  };
  return (
    <section aria-labelledby={`${id}-name`} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h4 id={`${id}-name`} className="text-sm font-medium">
              {AGENT[harness]}
            </h4>
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
          {resolved.error !== null && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span className="min-w-0 break-words">{resolved.error}</span>
            </p>
          )}
        </div>
        {!open && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Change the path of ${AGENT[harness]}`}
            className="-my-1 h-11 shrink-0 text-muted-foreground keyboard:h-8"
            onClick={() => setEditing(true)}
          >
            Change
          </Button>
        )}
      </div>
      {open && (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send({ _tag: 'Save', harness });
          }}
        >
          <label htmlFor={id} className="sr-only">
            Path of {AGENT[harness]}
          </label>
          <Input
            id={id}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            placeholder={`/path/to/${harness}`}
            value={value}
            disabled={saving}
            aria-invalid={problem !== null}
            aria-describedby={problem ? `${id}-problem` : `${id}-hint`}
            onChange={(event) =>
              send({ _tag: 'Typed', harness, path: event.currentTarget.value })
            }
            className="h-11 min-w-0 font-mono text-base keyboard:h-9 md:text-base keyboard:md:text-[13px]"
          />
          {problem !== null ? (
            <p
              id={`${id}-problem`}
              role="alert"
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0"
              />
              {problem}
            </p>
          ) : (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              The Machine runs it with --version before saving. Sessions started
              after a change use it.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              className="h-11 keyboard:h-8"
              disabled={model.saving !== null || !changed}
            >
              {saving && model.drafts[harness] !== undefined && <Spinner />}
              Save path
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 keyboard:h-8"
              disabled={model.saving !== null}
              onClick={close}
            >
              Cancel
            </Button>
            {configuredPath !== null && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto h-11 text-muted-foreground keyboard:h-8"
                disabled={model.saving !== null}
                onClick={() => send({ _tag: 'UseDefault', harness })}
              >
                {saving && model.drafts[harness] === undefined && <Spinner />}
                Use default
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export const HarnessBinariesView = View.make(
  HarnessBinariesLive,
  ({ root, model, send }) => {
    const health = useHealth(model.machineId);
    return (
      <div {...root} className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">Agents</h3>
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
        ) : model.binaries === null ? (
          outOfReach(health) ? (
            <p role="status" className="text-sm text-muted-foreground">
              Not answering, last seen {ago(health.lastSeen)}. Its agents show
              here once it is back.
            </p>
          ) : (
            <div className="flex flex-col gap-5" aria-busy>
              {['claude', 'codex'].map((name) => (
                <div key={name} className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            {model.binaries.map((binary) => (
              <Binary
                key={binary.harness}
                binary={binary}
                model={model}
                send={send}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);
