import type { HarnessBinary } from '@kestack/ai-toolkit/api';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/components/badge';
import { Button } from '@kestack/web-platform/components/button';
import { Input } from '@kestack/web-platform/components/input';
import {
  CircleAlertIcon,
  CircleCheckIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages } from '../../../shared/pages/index.ts';

/*
 * Settings: each agent's binary, one card each. It says what runs now (the
 * path, and its version or why it does not run) and whether that is the
 * agent's default. A path typed is saved only once the server has run it;
 * a refusal shows under the field, which keeps what was typed. "Use
 * default" forgets the path set.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

type Self = ViewProps<typeof Pages.SettingsLive>;

function Binary({
  binary: { harness, configuredPath, resolved },
  model,
  send,
}: Pick<Self, 'model' | 'send'> & { readonly binary: HarnessBinary }) {
  const id = `binary-${harness}`;
  const problem = model.problems[harness] ?? null;
  const saving = model.saving === harness;
  const value = model.drafts[harness] ?? configuredPath ?? '';
  const changed = value.trim() !== (configuredPath ?? '');
  return (
    <section
      aria-labelledby={`${id}-name`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 id={`${id}-name`} className="text-sm font-semibold">
            {AGENT[harness]}
          </h3>
          {resolved.isDefault ? (
            <Badge variant="secondary">Default</Badge>
          ) : (
            <Badge variant="outline">Custom path</Badge>
          )}
          {resolved.error === null && resolved.version !== null && (
            <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <CircleCheckIcon
                aria-hidden
                className="size-3.5 shrink-0 text-positive"
              />
              <span className="truncate" title={resolved.version}>
                {resolved.version}
              </span>
            </span>
          )}
        </div>
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
      </div>
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'Save', harness });
        }}
      >
        <label htmlFor={id} className="text-sm font-medium">
          Custom path
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={id}
            autoComplete="off"
            spellCheck={false}
            placeholder={`/path/to/${harness}`}
            value={value}
            disabled={saving}
            aria-invalid={problem !== null}
            aria-describedby={problem ? `${id}-problem` : `${id}-hint`}
            onChange={(event) =>
              send({ _tag: 'Typed', harness, path: event.currentTarget.value })
            }
            className="min-w-0 flex-1 basis-64 font-mono text-base md:text-[13px]"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={model.saving !== null || !changed}>
              {saving && model.drafts[harness] !== undefined && <Spinner />}
              Save
            </Button>
            {configuredPath !== null && (
              <Button
                type="button"
                variant="ghost"
                disabled={model.saving !== null}
                onClick={() => send({ _tag: 'UseDefault', harness })}
              >
                {saving && model.drafts[harness] === undefined && <Spinner />}
                Use default
              </Button>
            )}
          </div>
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
            The server runs it with --version before saving. Sessions started
            after a change use it.
          </p>
        )}
      </form>
    </section>
  );
}

export const SettingsView = View.make(
  Pages.SettingsLive,
  ({ root, model, send }) => (
    <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 md:py-10">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">
            The program each agent runs as on this machine. Leave it on the
            default unless you keep your own build.
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
        ) : model.binaries === null ? (
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
        ) : (
          <div className="flex flex-col gap-4">
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
    </div>
  ),
);
