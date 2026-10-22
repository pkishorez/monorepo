import { useCallback, useMemo } from 'react';
import { useChild, useChildren, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  GitForkIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import * as places from '../../../places/index.ts';
import { RunningDot } from '../../../ui/running-dot/index.ts';
import { useOffline } from '../../connection/index.ts';
import { SkillPicker } from '../composer/index.ts';
import { ModelPicker, Triggers } from '../model-picker/index.ts';
import { current, SessionLive, skillsOf } from './actor.ts';
import { btwQuestion } from './btw.ts';
import { AskAnswer } from './ask.tsx';
import { SessionComposer } from './composer.tsx';
import { useFollow } from './follow.ts';
import { useSessionKeys } from './keys.ts';
import { EarlierRows, earlierOf, Rows, thread } from './transcript/index.ts';

/*
 * A session: the transcript in a centred column that follows new messages
 * while you are at its bottom, and the composer pinned under it. Its title,
 * agent and model are in the header. Its words can be selected, though the
 * App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript; a fork
 * names the session it came from over it, and draws what it carries on
 * from as one folded line before its own turns. The answer to a `/btw`
 * floats over the composer.
 */

export const SessionView = View.make(
  SessionLive,
  ({ root, model, children, send }) => {
    const found = useChild(children.session, ({ model }) => model);
    const messages = useChild(children.messages, ({ model }) => model);
    const session = found?.rows[0]?.row;
    const forkedFrom = session?.forkedFrom ?? null;
    const windows = useChildren(children.earlier);
    const earlier = useMemo(
      () =>
        forkedFrom === null
          ? null
          : earlierOf(
              forkedFrom,
              model.lineage,
              new Map(
                windows.map(({ props, model }) => [
                  props.sessionId,
                  {
                    rows: model.rows.map(({ row }) => row),
                    caughtUp: model.caughtUp,
                  },
                ]),
              ),
            ),
      [forkedFrom, model.lineage, windows],
    );
    const original =
      model.lineage.find(({ id }) => id === forkedFrom?.sessionId)?.title ||
      'Untitled session';
    const dismiss = useCallback(() => send({ _tag: 'Dismiss' }), [send]);
    const running = session?.status === 'running';
    const rows = useMemo(
      () => thread((messages?.rows ?? []).map(({ row }) => row)),
      [messages?.rows],
    );
    const follow = useFollow();
    const { scroller, content } = follow;
    const offline = useOffline();
    const opening = {
      isOpen: (id: string) => model.open.includes(id),
      toggle: (id: string) => send({ _tag: 'Toggle', id }),
    };
    const forking = {
      fork: (afterTurnId: string) => send({ _tag: 'Fork', afterTurnId }),
      pending: model.forking,
    };
    // Rows the device holds draw at once; with none, a skeleton until the
    // server has answered, and only then is a missing row believed.
    const missing = found?.caughtUp === true && session === undefined;
    const waiting =
      session === undefined ||
      ((messages?.rows.length ?? 0) === 0 && messages?.caughtUp !== true);
    const skills = skillsOf(model);
    const { picking } = model;
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
                  to={places.session(session.projectId, forkedFrom.sessionId)}
                  className="focus-ring min-w-0 truncate rounded-sm text-foreground/80 underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground motion-reduce:transition-none"
                >
                  {original}
                </Router.Link>
              </p>
            )}
            {missing ? (
              <p className="text-sm text-muted-foreground">
                It may belong to a project that was removed.
              </p>
            ) : waiting ? (
              <div className="flex flex-col gap-3" aria-busy>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <>
                {earlier !== null && (
                  <EarlierRows
                    title={original}
                    earlier={earlier}
                    opening={opening}
                    forking={forking}
                  />
                )}
                <Rows
                  rows={rows}
                  opening={opening}
                  running={running}
                  forking={forking}
                />
              </>
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
              known={SkillPicker.known(skills)}
              skills={{
                how: picking?._tag === 'Skills' ? picking.how : null,
                offered: SkillPicker.offers(skills),
                onOpen: (how, at, typed) =>
                  send({
                    _tag: 'Open',
                    picking: { _tag: 'Skills', how, at, typed },
                  }),
                picker: children.skills && (
                  <SkillPicker.View instance={children.skills} />
                ),
              }}
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
                <Triggers
                  catalog={model.catalog}
                  current={current(model)}
                  started
                  how={picking?._tag === 'Model' ? picking : null}
                  onOpen={(at, how) =>
                    send({ _tag: 'Open', picking: { _tag: 'Model', how, at } })
                  }
                >
                  {children.models && (
                    <ModelPicker.View instance={children.models} />
                  )}
                </Triggers>
              }
              onType={(text) => send({ _tag: 'Typed', text })}
              onAttach={(attachments) => send({ _tag: 'Attach', attachments })}
              onSend={() => send({ _tag: 'Send' })}
              onStop={stop}
            />
          </div>
        </div>
      </div>
    );
  },
);
