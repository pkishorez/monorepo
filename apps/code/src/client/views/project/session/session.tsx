import { useCallback, useEffect, useMemo } from 'react';
import type { Message, Session } from '@kestack/ai-toolkit/api';
import { useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  GitForkIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { btwQuestion, Pages, router } from '../../../../shared/pages/index.ts';
import { RunningDot } from '../../running-dot/index.ts';
import { ModelPicker, SettingsPicker } from '../picker/index.ts';
import { useOffline, useSettled } from '../../settled/index.ts';
import { AskAnswer } from './ask.tsx';
import { SessionComposer } from './composer.tsx';
import { useFollow } from './follow.ts';
import { useSessionKeys } from './keys.ts';
import { Rows, thread } from './transcript/index.ts';

/*
 * A session: the transcript in a centred column that follows new messages
 * while you are at its bottom, and the composer pinned under it. Its title,
 * agent and model are in the header. Its words can be selected, though the
 * App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript; a fork
 * names the session it came from over it. The answer to a `/btw` floats
 * over the composer.
 */

export const SessionView = View.make(
  Pages.SessionLive,
  ({ root, model, children, send }) => {
    const found = useChild(children.session, ({ model }) => model);
    const messages = useChild(children.messages, ({ model }) => model);
    const session = found?.rows[0]?.row as Session | undefined;
    const forkedFrom = session?.forkedFrom ?? null;
    useEffect(() => {
      if (session === undefined) return;
      send({
        _tag: 'Seen',
        projectId: session.projectId,
        harness: session.harness,
        parentId: session.forkedFrom?.sessionId ?? null,
      });
    }, [session?.projectId, session?.harness, session?.forkedFrom?.sessionId]);
    const dismiss = useCallback(() => send({ _tag: 'Dismiss' }), [send]);
    const running = session?.status === 'running';
    const rows = useMemo(
      () => thread((messages?.rows ?? []).map(({ row }) => row as Message)),
      [messages?.rows],
    );
    const follow = useFollow();
    const { scroller, content } = follow;
    const settled = useSettled();
    const offline = useOffline();
    const opening = {
      isOpen: (id: string) => model.open.includes(id),
      toggle: (id: string) => send({ _tag: 'Toggle', id }),
    };
    const missing =
      settled && found?.status === 'ready' && session === undefined;
    const harness =
      model.harnesses?.find(({ name }) => name === session?.harness) ?? null;
    const stop = () => send({ _tag: 'Stop' });
    const canStop = running && !model.stopping && offline === null;
    useSessionKeys({
      scroller,
      follow,
      stop,
      canStop,
      closeAnswer: model.asked === null ? null : dismiss,
    });
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto select-text [overflow-anchor:none]"
        >
          <div
            ref={content}
            className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-8 pb-10 sm:px-6"
          >
            {forkedFrom !== null && session !== undefined && (
              <p className="-mt-2 -mb-4 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <GitForkIcon aria-hidden className="size-3.5 shrink-0" />
                <span className="shrink-0">Forked from</span>
                <Router.Link
                  to={router.Project.Session({
                    projectId: session.projectId,
                    sessionId: forkedFrom.sessionId,
                  })}
                  className="focus-ring min-w-0 truncate rounded-sm text-foreground/80 underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground motion-reduce:transition-none"
                >
                  {children.parent ? (
                    <ParentTitle instance={children.parent} />
                  ) : (
                    'Untitled session'
                  )}
                </Router.Link>
              </p>
            )}
            {missing ? (
              <p className="text-sm text-muted-foreground">
                It may belong to a project that was removed.
              </p>
            ) : messages?.status !== 'ready' || session === undefined ? (
              <div className="flex flex-col gap-3" aria-busy>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <Rows
                rows={rows}
                opening={opening}
                running={running}
                forking={{
                  fork: (afterTurnId) => send({ _tag: 'Fork', afterTurnId }),
                  pending: model.forking,
                }}
              />
            )}
            {session?.status === 'interrupted' &&
              messages?.status === 'ready' && (
                <p
                  role="status"
                  className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
                >
                  <TriangleAlertIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-warning"
                  />
                  The server stopped mid-turn, so some work may be half done.
                  Send a message to carry on; the agent remembers the
                  conversation.
                </p>
              )}
            {running && messages?.status === 'ready' && (
              <p
                role="status"
                className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
              >
                {offline === null ? (
                  <>
                    <RunningDot /> Working…
                  </>
                ) : (
                  'Last seen working. Updates resume when the server is back.'
                )}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-2 pb-4 sm:pb-5">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <SessionComposer
              draft={model.draft}
              attachments={model.attachments}
              skills={model.skills}
              skillsProblem={model.skillsProblem}
              running={running}
              asking={btwQuestion(model.draft) !== null}
              stopping={model.stopping}
              problem={model.problem}
              offline={offline}
              above={
                model.asked && (
                  <AskAnswer
                    key={model.asked.id}
                    asked={model.asked}
                    onDismiss={dismiss}
                  />
                )
              }
              toolbar={
                session !== undefined &&
                harness !== null && (
                  <>
                    <ModelPicker
                      agent={{
                        name: harness.name,
                        label: harness.label,
                        unavailable: null,
                      }}
                      value={model.model ?? session.model}
                      models={model.models?.list ?? []}
                      loading={model.models === null}
                      onPick={(id) => send({ _tag: 'PickModel', model: id })}
                    />
                    <SettingsPicker
                      settings={harness.settings}
                      values={Object.fromEntries(
                        harness.settings.map(({ key, default: value }) => [
                          key,
                          model.settings[key] ?? session.settings[key] ?? value,
                        ]),
                      )}
                      onPick={(key, value) =>
                        send({ _tag: 'PickSetting', key, value })
                      }
                    />
                  </>
                )
              }
              onType={(text) => send({ _tag: 'Typed', text })}
              onAttach={(attachments) => send({ _tag: 'Attach', attachments })}
              onSend={() => send({ _tag: 'Send' })}
              onStop={stop}
              onPaletteOpen={() => send({ _tag: 'RetrySkills' })}
            />
          </div>
        </div>
      </div>
    );
  },
);

/** The title of the session this one was forked from, once its row is read. */
function ParentTitle({
  instance,
}: {
  readonly instance: NonNullable<
    ViewProps<typeof Pages.SessionLive>['children']['parent']
  >;
}) {
  const parent = useChild(
    instance,
    ({ model }) => model.rows[0]?.row as Session | undefined,
  );
  return parent?.title || 'Untitled session';
}
