import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useChild, useChildren, View } from '@kestack/kabuki/react';
import type { Session } from '@kestack/connect/code';
import { Router, useElementScrollRestoration } from '@kestack/kabuki/routing';
import { ArrowDownIcon, GitForkIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  GUTTERED,
  useGutter,
} from '../../../../../../../ui/page/gutter/index.ts';
import * as routes from '../../../../../../routes/index.ts';
import { RunningDot } from '../../../../../../../ui/labels/status/index.ts';
import { keys, useBound } from '../../../commands.ts';
import {
  useMachineId,
  useOffline,
} from '../../../../machine/connection/index.ts';
import { Draft } from '../draft/index.ts';
import { readyOf, SessionLive } from './actor.ts';
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
 * its Draft (`draft/`), with Stop beside its send button while a turn
 * runs. Its title, agent and model are in the header. Its words can be
 * selected, though the App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript; a fork
 * names the session it came from over it, and draws what it carries on
 * from as one folded line before its own turns. Typing in the Draft draws
 * only the Draft. While the Draft is in Side Question mode, the question
 * takes the transcript's place, which keeps where it was scrolled to.
 * Nothing of it is drawn until all of it is read from this device
 * (`readyOf`), then the transcript and the Draft in one step;
 * `SessionReady` says so once, before Layout is first drawn.
 */

/** The transcript's name, under which its scroll is kept per history entry. */
const TRANSCRIPT = 'transcript';

export const SessionView = View.make(
  SessionLive,
  ({ root, model, props, children, send }) => {
    const machineId = useMachineId();
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
    // Named only once its chain is read, so no placeholder title shows first.
    const original =
      model.row?.id !== props.params.sessionId
        ? null
        : model.lineage.find(({ id }) => id === forkedFrom?.sessionId)?.title ||
          'Untitled session';
    const running = session?.status === 'running';
    const rows = useMemo(
      () => thread((messages?.rows ?? []).map(({ row }) => row)),
      [messages?.rows],
    );
    const follow = useFollow(
      props.params.sessionId,
      useElementScrollRestoration({ id: TRANSCRIPT }),
    );
    const { scroller, content } = follow;
    const page = keys.useFocusSpot('content', 'page', { default: true });
    const offline = useOffline(machineId);
    // Kept the same while they are, so the transcript is not drawn again
    // as Stop or a fork changes.
    const opening = useMemo(
      () => ({
        isOpen: (id: string) => model.open.includes(id),
        toggle: (id: string) => send({ _tag: 'Toggled', id }),
      }),
      [model.open, send],
    );
    const forking = useMemo(
      () => ({
        fork: (afterTurnId: string) => send({ _tag: 'ForkAsked', afterTurnId }),
        pending: model.forking,
      }),
      [model.forking, send],
    );
    // Rows the device holds draw at once, even while the Machine does not
    // answer; a missing row is believed only once its Machine has answered.
    // A skeleton only for what this device has never had: the row, or the
    // session's messages, whose Window never synced here.
    const missing = found?.caughtUp === true && session === undefined;
    // Until all of it is read from this device, nothing: then the
    // transcript and the Draft in one step.
    const restored = useChild(children.draft, ({ model }) => model.restored);
    const reading = !readyOf({
      sessionId: props.params.sessionId,
      model,
      found: found && { status: found.status, held: session !== undefined },
      messages,
      earlier: windows.map(({ model }) => model),
      restored,
    });
    const waiting =
      session === undefined ||
      (messages?.rows.length === 0 && messages.neverSynced.length > 0);
    const stop = useCallback(() => send({ _tag: 'StopAsked' }), [send]);
    const canStop = running && !model.stopping && offline === null;
    useSessionKeys({ scroller, follow, stop, canStop });
    const stopKeys = useBound('content.stop');
    // Where the Draft draws Side Question mode, in the transcript's place.
    const [sideQuestion, setSideQuestion] = useState<HTMLElement | null>(null);
    const side =
      useChild(children.draft, ({ model }) => model.mode === 'SideQuestion') ===
      true;
    // What the session adds to its Draft's foot: Stop, and why a stop or a
    // fork was refused.
    const slots = useMemo(
      () => ({
        problem: model.problem,
        sideQuestion,
        actions: running && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full pointer-coarse:h-11 pointer-coarse:px-4"
            disabled={model.stopping || offline !== null}
            title={
              stopKeys === null
                ? 'Stop the turn'
                : `Stop the turn (${stopKeys})`
            }
            onClick={stop}
          >
            {model.stopping && <Spinner />}
            Stop
          </Button>
        ),
      }),
      [
        model.problem,
        model.stopping,
        running,
        offline,
        stopKeys,
        stop,
        sideQuestion,
      ],
    );
    // The Draft sits under the transcript, inset by the room its scrollbar keeps.
    const gutter = useGutter();
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={(element) => {
            scroller.current = element;
            return element === null ? undefined : page(element);
          }}
          tabIndex={-1}
          hidden={side}
          data-scroll-restoration-id={TRANSCRIPT}
          // Positioned, so what is placed absolutely inside it, such as
          // markdown's screen-reader-only footnotes heading, is measured
          // here and never makes the page around it scroll too.
          className={`relative min-h-0 flex-1 overflow-y-auto outline-none select-text [overflow-anchor:none] ${GUTTERED}`}
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
        <div
          ref={setSideQuestion}
          hidden={!side}
          className={`relative min-h-0 flex-1 overflow-y-auto select-text ${GUTTERED}`}
        />
        {/* A Draft only under a row held here, so none shows over a
            session its Machine then says is missing. */}
        {session !== undefined && !reading && (
          <div
            style={{ paddingInline: gutter }}
            className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent has-[[data-slot=draft][data-touch]]:pb-0"
          >
            <ToBottom
              shown={follow.away && !side}
              onClick={() => follow.holdOn(true)}
            />
            <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 has-[[data-slot=draft][data-touch]]:px-0">
              <Draft.Slots value={slots}>
                <Draft.view instance={children.draft} />
              </Draft.Slots>
            </div>
          </div>
        )}
      </div>
    );
  },
);

/**
 * Draws nothing: says once that the session can be drawn whole, all of it
 * read from this device, so Layout first draws it with its transcript and
 * its Draft.
 */
export const SessionReady = View.make(
  SessionLive,
  ({ model, props, children, send }) => {
    const found = useChild(children.session, ({ model }) => model);
    const messages = useChild(children.messages, ({ model }) => model.status);
    const earlier = useChildren(children.earlier, ({ model }) => model.status);
    const restored = useChild(children.draft, ({ model }) => model.restored);
    const ready = readyOf({
      sessionId: props.params.sessionId,
      model,
      found: found && {
        status: found.status,
        held: found.rows.length > 0,
      },
      messages: messages && { status: messages },
      earlier: earlier.map((status) => ({ status })),
      restored,
    });
    useEffect(() => {
      if (ready && !model.ready) send({ _tag: 'Ready' });
    }, [ready, model.ready]);
    return null;
  },
);

/**
 * Away from the bottom, a way back: a small round button centred over the
 * Draft that glides to the very bottom and follows from there. It fades
 * and rises in, and is gone, not merely hidden, from the keys while away.
 */
function ToBottom({
  shown,
  onClick,
}: {
  readonly shown: boolean;
  readonly onClick: () => void;
}) {
  return (
    <div
      inert={!shown}
      className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-3 flex justify-center"
    >
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        data-shown={shown ? '' : undefined}
        className="pointer-events-auto h-11 translate-y-2 gap-1.5 rounded-full bg-background px-4 text-sm text-muted-foreground opacity-0 shadow-md transition-[opacity,translate,color] duration-200 ease-out hover:text-foreground data-shown:translate-y-0 data-shown:opacity-100 keyboard:h-8 keyboard:px-3 motion-reduce:transition-none"
      >
        <ArrowDownIcon aria-hidden className="size-3.5" />
        Scroll to bottom
      </Button>
    </div>
  );
}

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
  /** The title of the session it was forked from; null until its chain is read. */
  readonly original: string | null;
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
      className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-8 pb-10 sm:px-6"
    >
      {!reading &&
        original !== null &&
        session !== undefined &&
        session.forkedFrom !== null && (
          <p className="-mt-2 -mb-4 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GitForkIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="shrink-0">Forked from</span>
            <Router.Link
              to={routes.session(
                machineId,
                session.projectId,
                session.forkedFrom.sessionId,
              )}
              className="focus-ring -my-3.5 min-w-11 truncate rounded-sm py-3.5 text-foreground/80 underline keyboard:my-0 keyboard:min-w-0 keyboard:py-0 decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground motion-reduce:transition-none"
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
          {earlier !== null && original !== null && (
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
            forked={session?.forkedFrom != null}
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

export default SessionView;
