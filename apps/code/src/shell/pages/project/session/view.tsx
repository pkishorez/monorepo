import { memo, useCallback, useMemo } from 'react';
import { useChild, useChildren, View } from '@kestack/kabuki/react';
import type { Session } from '@kestack/ai-toolkit/api';
import { Router } from '@kestack/kabuki/routing';
import {
  GitForkIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import * as places from '../../../places/index.ts';
import { RunningDot } from '../../../../ui/running-dot/index.ts';
import { useMachineId, useOffline } from '../../../connection/index.ts';
import { Dictation } from '../../../actors/dictation/index.ts';
import { SkillPicker, useDraft } from '../draft/index.ts';
import { ModelPicker, Triggers } from '../model-picker/index.ts';
import { current, SessionLive, skillsOf } from './actor.ts';
import { btwQuestion } from './btw.ts';
import { AskAnswer } from './ask.tsx';
import { SessionStatusLine } from './status-line.tsx';
import { useFollow } from './follow.ts';
import { useSessionKeys } from './keys.ts';
import {
  EarlierRows,
  earlierOf,
  type Forking,
  type Opening,
  Rows,
  thread,
} from './transcript/index.ts';

/*
 * A session: the transcript in a centred column that follows new messages
 * while you are at its bottom, and under it, pinned to the page's foot,
 * its Draft with the Status Line in one card. Its title, agent and model are in the header. Its words can be selected, though the
 * App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript; a fork
 * names the session it came from over it, and draws what it carries on
 * from as one folded line before its own turns. The answer to a `/btw`
 * floats over the Status Line.
 */

export const SessionView = View.make(
  SessionLive,
  ({ root, model, props, children, send }) => {
    const machineId = useMachineId();
    const dictation = Dictation.useDictation({
      machineId,
      projectId: places.projectIn(props.route.params),
      sessionId: props.params.sessionId,
    });
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
    const follow = useFollow(props.params.sessionId);
    const { scroller, content } = follow;
    const offline = useOffline(machineId);
    // Kept the same while they are, so the transcript is not drawn again
    // as the Draft changes.
    const opening = useMemo(
      () => ({
        isOpen: (id: string) => model.open.includes(id),
        toggle: (id: string) => send({ _tag: 'Toggle', id }),
      }),
      [model.open, send],
    );
    const forking = useMemo(
      () => ({
        fork: (afterTurnId: string) => send({ _tag: 'Fork', afterTurnId }),
        pending: model.forking,
      }),
      [model.forking, send],
    );
    // Rows the device holds draw at once, even while the Machine does not
    // answer; a missing row is believed only once its Machine has answered.
    // A skeleton only for what this device has never had: the row, or the
    // session's messages, whose Window never synced here.
    const missing = found?.caughtUp === true && session === undefined;
    // Until the Store is read, nothing: what it holds shows a moment later.
    const reading =
      found === undefined ||
      found.status === 'loading' ||
      messages === undefined ||
      messages.status === 'loading';
    const waiting =
      session === undefined ||
      (messages?.rows.length === 0 && messages.neverSynced.length > 0);
    const skills = skillsOf(model);
    const { picking } = model;
    const stop = () => send({ _tag: 'Stop' });
    const canStop = running && !model.stopping && offline === null;
    const draft = useDraft({
      label: running ? 'Steer the agent' : 'Message',
      placeholder: running
        ? 'Steer the agent while it works, or /btw to ask on the side…'
        : 'Reply, or type / for skills…',
      text: model.draft,
      onTextChange: (text) => send({ _tag: 'Typed', text }),
      attachments: model.attachments,
      onAttachmentsChange: (attachments) =>
        send({ _tag: 'Attach', attachments }),
      insert: model.insert,
      onInsert: (what) => send({ _tag: 'Insert', what }),
      onSend: () => {
        if (offline === null) send({ _tag: 'Send' });
      },
      known: SkillPicker.known(skills),
      skills: {
        how: picking?._tag === 'Skills' ? picking.how : null,
        offered: SkillPicker.offers(skills),
        onOpen: (how, typed) =>
          send({ _tag: 'Open', picking: { _tag: 'Skills', how, typed } }),
        picker: children.skills && (
          <SkillPicker.View instance={children.skills} />
        ),
      },
      dictation,
      ...(offline === null ? {} : { describedBy: 'draft-offline' }),
    });
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
          ref={(element) => {
            scroller.current = element;
            return element === null ? undefined : draft.page(element);
          }}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto outline-none select-text [overflow-anchor:none]"
        >
          <Transcript
            content={content}
            machineId={machineId}
            session={session}
            original={original}
            missing={missing}
            reading={reading}
            waiting={waiting}
            earlier={earlier}
            rows={rows}
            opening={opening}
            forking={forking}
            running={running}
            ready={messages?.status === 'ready'}
            offline={offline}
          />
        </div>
        {!missing && (
          <div className="relative shrink-0 bg-background pt-2 pb-3 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent">
            <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
              <SessionStatusLine
                draft={draft}
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
                onStop={stop}
              >
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
              </SessionStatusLine>
            </div>
          </div>
        )}
      </div>
    );
  },
);

/**
 * The transcript, drawn again only as what it shows changes: never as the
 * Draft is typed into, or a Dictation starts or stops.
 */
const Transcript = memo(function Transcript({
  content,
  machineId,
  session,
  original,
  missing,
  reading,
  waiting,
  earlier,
  rows,
  opening,
  forking,
  running,
  ready,
  offline,
}: {
  readonly content: ReturnType<typeof useFollow>['content'];
  readonly machineId: string;
  readonly session: Session | undefined;
  readonly original: string;
  readonly missing: boolean;
  readonly reading: boolean;
  readonly waiting: boolean;
  readonly earlier: ReturnType<typeof earlierOf> | null;
  readonly rows: ReturnType<typeof thread>;
  readonly opening: Opening;
  readonly forking: Forking;
  readonly running: boolean;
  readonly ready: boolean;
  readonly offline: string | null;
}) {
  return (
    <div
      ref={content}
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-8 pb-10 sm:px-6"
    >
      {session !== undefined && session.forkedFrom !== null && (
        <p className="-mt-2 -mb-4 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <GitForkIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="shrink-0">Forked from</span>
          <Router.Link
            to={places.session(
              machineId,
              session.projectId,
              session.forkedFrom.sessionId,
            )}
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
      ) : reading ? null : waiting ? (
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
      {session?.status === 'interrupted' && ready && (
        <p
          role="status"
          className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
        >
          <TriangleAlertIcon
            aria-hidden
            className="size-3.5 shrink-0 text-warning"
          />
          The server stopped mid-turn, so some work may be half done. Send a
          message to carry on; the agent remembers the conversation.
        </p>
      )}
      {running && ready && (
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
  );
});
