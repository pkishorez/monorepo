import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { View, useChild } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/view';
import { Router } from '@kestack/kabuki/routing';
import type { Session } from '@kestack/connect/code';
import { ArrowDownIcon, GitForkIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useDevice } from '@kestack/web-platform/ui/input';
import { GUTTERED, useGutter } from '../../../../../ui/page/gutter/index.ts';
import * as routes from '../../../../app.ts';
import { keys, useBound } from '../../../frame/commands.ts';
import { useConnectionId, useOffline } from '../../../connection/link/index.ts';
import { agentName } from '../../../../../ui/labels/agent/index.ts';
import * as Picker from '../../../../../ui/controls/picker/index.ts';
import { Loading } from '../../../../../ui/controls/notice/index.ts';
import { Draft } from '../draft/index.ts';
import { readyOf, SessionLive } from './actor.ts';
import {
  Scrolled,
  type Scroller,
  useScrollKeys,
  useScroller,
} from './scroller/index.ts';
import { Question } from './panels/question/index.ts';
import {
  exactly,
  levelOf,
  SessionDetails,
  tokens,
} from './panels/details/index.ts';
import {
  EarlierRows,
  Folder,
  itemsOf,
  RunningButton,
  earlierOf,
  type Forking,
  type Live,
  LiveContext,
  type Opening,
  Rows,
  SessionOpener,
  SubagentDrawers,
  CommandDrawer,
  Transcript as Read,
  useFacts,
  useOpening,
  useRows,
} from './transcript/index.ts';

/*
 * A session: the transcript in a centred column that follows new messages
 * while you are at its bottom, and under it, pinned to the page's foot,
 * its Draft (`draft/`), with Stop beside its send button while it works:
 * while a turn runs, or only its Background Jobs do. Over the
 * transcript's top right, a floating button counts the subagents and
 * commands it runs, and opens the Running Picker: in place by a click,
 * centred by `r`, as a Drawer by a touch
 * (`transcript/turns/answer/work/live/running.tsx`). A subagent
 * opens whole: with a keyboard or a mouse in one dialog, one it asked in
 * its place with a way back; on a touch screen in a drawer, and one it
 * asked in a drawer over that
 * (`transcript/turns/answer/work/live/drawers/drawers.tsx`). A command
 * opens the same way, with what it writes, live
 * (`transcript/turns/answer/work/live/drawers/command/`). Its title, agent and model are in the header. Its words can be
 * selected, though the App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript; a fork
 * names the session it came from over it, and draws what it carries on
 * from as one folded line before its own turns. Typing in the Draft draws
 * only the Draft. A Btw asked from the Draft is read in its Btw Drawer,
 * over the transcript's foot, the transcript staying as it was, its
 * agent told to the Draft as who answers.
 * Its details open over it (`panels/details/`): from Actions, Ctrl+G, a turn's
 * details, or how full its context is, which the Draft shows by its send
 * button as the Context Preference says; each turn in them opens where it
 * is in the transcript.
 * While its agent waits on an Agent Question, the Question Panel stands
 * in for the Draft (`panels/question/`), with Stop; expanded, it covers the
 * transcript, which cannot be reached under it. Nothing of it is drawn until all of it is read from this device
 * (`readyOf`), then the transcript and the Draft in one step; until
 * then, and while what it shows never synced here, "Loading session…",
 * once the wait is long enough to see;
 * `SessionReady` says so once, before the frame is first drawn. Both draw
 * inside the transcript's View (`transcript/`), from what it reads.
 */

/** The transcript's name, under which its scroll is kept per history entry. */
const TRANSCRIPT = 'transcript';

type Self = ViewProps<typeof SessionLive>;

export const SessionView = View.make(SessionLive, (self) => (
  <Read.Around value={<Page {...self} />}>
    <Read.view instance={self.children.transcript} />
  </Read.Around>
));

/** The page, from what its transcript reads. */
function Page({ root, model, props, children, send }: Self) {
  const connectionId = useConnectionId();
  const { found, messages, windows, running: picker } = Read.useRead();
  const session = found?.rows[0]?.row;
  const forkedFrom = session?.forkedFrom ?? null;
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
  const jobs = model.jobs;
  // It works while its turn runs, or only its Background Jobs do.
  const working = running || jobs.length > 0;
  const rows = useRows(
    useMemo(
      () => (messages?.rows ?? []).map(({ row }) => row),
      [messages?.rows],
    ),
  );
  const scroll = useScroller(props.params.sessionId, TRANSCRIPT);
  const { scroller, content } = scroll;
  const page = keys.useFocusSpot('content', 'page', { default: true });
  const offline = useOffline(connectionId);
  // The same while the transcript is drawn, folds opening and shutting
  // included, so the transcript is not drawn again as Stop, a fork or a
  // fold changes; each fold reads its own.
  const toggle = useCallback(
    (id: string) => send({ _tag: 'Toggled', id }),
    [send],
  );
  const opening = useOpening(model.open, toggle);
  const forking = useMemo(
    () => ({
      fork: (afterTurnId: string) => send({ _tag: 'ForkAsked', afterTurnId }),
      pending: model.forking,
    }),
    [model.forking, send],
  );
  // Rows the device holds draw at once, even while the Connection does not
  // answer; a missing row is believed only once its Connection has answered.
  // Loading only for what this device has never had: the row, or the
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
  const canStop = working && !model.stopping && offline === null;
  const live = useMemo(
    (): Live => ({
      jobs,
      stopping: model.stoppingJobs,
      depth: 0,
      open: (id, depth) => send({ _tag: 'DrawerOpened', id, under: depth }),
      stop: (jobId) => send({ _tag: 'JobStopAsked', jobId }),
    }),
    [jobs, model.stoppingJobs, send],
  );
  const closeDrawers = useCallback(
    (depth: number) => send({ _tag: 'DrawersClosed', depth }),
    [send],
  );
  const closeCommand = useCallback(
    () => send({ _tag: 'CommandClosed' }),
    [send],
  );
  // Another session's drawers do not carry over.
  useEffect(() => {
    closeDrawers(0);
    closeCommand();
  }, [props.params.sessionId, closeDrawers, closeCommand]);
  // 8. Running: what runs, read from its rows and jobs, told to its page.
  const folder = useContext(Folder);
  const runningItems = useMemo(
    () => itemsOf(rows, jobs, running, folder),
    [rows, jobs, running, folder],
  );
  const runningKey = JSON.stringify(runningItems);
  useEffect(() => {
    send({ _tag: 'RunningRead', items: runningItems });
  }, [runningKey]);
  const openPicker = Picker.useOpen();
  const openRunning = useCallback(
    (how: typeof Picker.How.Type) =>
      openPicker(() => send({ _tag: 'RunningOpened', how })),
    [openPicker, send],
  );
  keys.useAction('app.running', () => openRunning('keys'), {
    enabled: runningItems.length > 0,
  });
  const runningKeys = useBound('app.running');
  useScrollKeys(scroll);
  // A Message sent from the Draft, typed or dictated: back to the bottom,
  // following, so it shows as it arrives.
  const sends = useChild(children.draft, ({ model }) => model.sends);
  useEffect(() => {
    if (sends) scroll.holdOn(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sends]);
  keys.useAction('content.stop', stop, { enabled: canStop });
  const stopKeys = useBound('content.stop');
  // 9. Context, and the session's details.
  const openDetails = useCallback(
    () => send({ _tag: 'DetailsToggled', open: true }),
    [send],
  );
  keys.useAction('content.details', openDetails, {
    enabled: session !== undefined && !reading,
  });
  const detailsKeys = useBound('content.details');
  const { touch, keyboard } = useDevice();
  // From a turn's details, on touch, once its Drawer has slid away, so
  // the tap that chose it does not land on what opens.
  const openFromTurn = useCallback(() => {
    if (touch && !keyboard) setTimeout(openDetails, AFTER_DRAWER);
    else openDetails();
  }, [touch, keyboard, openDetails]);
  const facts = useFacts(rows, forkedFrom !== null, model.details);
  const used = model.context?.usedTokens;
  const max = model.context?.maxTokens;
  const context = useMemo(() => {
    if (used === undefined || max === undefined || max <= 0) return null;
    if (model.contextShown === 'off') return null;
    if (model.contextShown === 'nearlyFull' && levelOf(used, max) === 'fine')
      return null;
    const level = levelOf(used, max);
    const state = { fine: '', filling: ' Filling.', full: ' Full.' }[level];
    return {
      used: tokens(used),
      max: tokens(max),
      title: `Context: ${exactly(used)} of ${exactly(max)} tokens.${state} Session details${detailsKeys === null ? '' : ` (${detailsKeys})`}`,
      fraction: Math.min(1, used / max),
      level,
      onOpen: openDetails,
    };
  }, [used, max, model.contextShown, openDetails, detailsKeys]);
  // While its agent asks, the Question Panel stands in for the Draft.
  const asked =
    useChild(
      children.question,
      (question) => Question.shownOf(question.model) !== null,
    ) === true;
  const expanded =
    useChild(children.question, (question) =>
      Question.expandedOf(question.model),
    ) === true;
  // Where the Question Panel is drawn expanded, over the transcript.
  const [questionPlace, setQuestionPlace] = useState<HTMLElement | null>(null);
  const around = useMemo(
    () => ({
      place: questionPlace,
      agent: session === undefined ? 'The agent' : agentName(session.harness),
      harness: session?.harness ?? null,
      problem: model.problem,
      stop: running
        ? {
            run: stop,
            stopping: model.stopping,
            disabled: offline !== null,
            keys: stopKeys,
          }
        : null,
    }),
    [
      questionPlace,
      session?.harness,
      model.problem,
      running,
      stop,
      model.stopping,
      offline,
      stopKeys,
    ],
  );
  // The Btw Drawer, expanded over the transcript's foot.
  const btw =
    useChild(
      children.draft,
      ({ model }) => model.asked?.drawer === 'Expanded',
    ) === true && !asked;
  // What the session adds to its Draft's foot: Stop, and why a stop or a
  // fork was refused.
  const slots = useMemo(
    () => ({
      problem: model.problem,
      answerer: { agent: around.agent, harness: around.harness },
      stop: around.stop,
      context,
      actions: working && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full pointer-coarse:h-11 pointer-coarse:px-4"
          disabled={model.stopping || offline !== null}
          title={
            stopKeys === null
              ? 'Stop everything it runs'
              : `Stop everything it runs (${stopKeys})`
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
      working,
      offline,
      stopKeys,
      stop,
      around.agent,
      around.harness,
      around.stop,
      context,
    ],
  );
  // The Draft sits under the transcript, inset by the room its scrollbar keeps.
  const gutter = useGutter();
  return (
    <div {...root} className="relative flex min-h-0 flex-1 flex-col">
      {/* Over the transcript's top right, in its column, while anything runs. */}
      {(runningItems.length > 0 || model.picking !== null) && !reading && (
        <div
          style={{ paddingInline: gutter }}
          className="pointer-events-none absolute inset-x-0 top-3 z-20"
        >
          <div className="mx-auto flex w-full max-w-4xl justify-end px-4 sm:px-6">
            <div className="pointer-events-auto">
              <RunningButton
                items={runningItems}
                how={model.picking}
                onOpen={openRunning}
                title={
                  runningKeys === null
                    ? 'Running now'
                    : `Running now (${runningKeys})`
                }
              >
                {picker}
              </RunningButton>
            </div>
          </div>
        </div>
      )}
      <div
        ref={(element) => {
          scroller.current = element;
          return element === null ? undefined : page(element);
        }}
        tabIndex={-1}
        inert={expanded}
        data-scroll-restoration-id={TRANSCRIPT}
        // Positioned, so what is placed absolutely inside it, such as
        // markdown's screen-reader-only footnotes heading, is measured
        // here and never makes the page around it scroll too.
        className={`relative min-h-0 flex-1 overflow-y-auto outline-none select-text [overflow-anchor:none] ${GUTTERED}`}
      >
        <Scrolled value={scroll.scroll}>
          <SessionOpener value={openFromTurn}>
            <LiveContext.Provider value={live}>
              <Transcript
                key={props.params.sessionId}
                content={content}
                connectionId={connectionId}
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
            </LiveContext.Provider>
          </SessionOpener>
        </Scrolled>
      </div>
      <div ref={setQuestionPlace} className="contents" />
      {/* A Draft only under a row held here, so none shows over a
            session its Connection then says is missing. */}
      {session !== undefined && !reading && (
        <div
          style={{ paddingInline: gutter }}
          className="relative shrink-0 bg-background pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-background before:to-transparent has-[[data-slot=draft][data-touch]]:pb-0"
        >
          <ToBottom
            shown={scroll.away && !btw && !expanded}
            onClick={() => scroll.holdOn(true)}
          />
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 has-[[data-slot=draft][data-touch]]:px-0">
            <Question.Around value={around}>
              <Question.view instance={children.question} />
            </Question.Around>
            {/* Not drawn while a question stands in for it, so no click,
                  tap, key or focus reaches it; its Saved Draft waits. */}
            {!asked && (
              <Draft.Slots value={slots}>
                <Draft.view instance={children.draft} />
              </Draft.Slots>
            )}
          </div>
        </div>
      )}
      <SubagentDrawers
        rows={rows}
        ids={model.drawers}
        running={running}
        opening={opening}
        live={live}
        model={session?.model ?? null}
        close={closeDrawers}
      />
      <LiveContext.Provider value={live}>
        <CommandDrawer
          command={model.command}
          rows={rows}
          onClose={closeCommand}
        />
      </LiveContext.Provider>
      {session !== undefined && (
        <SessionDetails
          open={model.details}
          onOpenChange={(open) => send({ _tag: 'DetailsToggled', open })}
          title={session.title}
          about={`${agentName(session.harness)} · ${session.model}`}
          facts={facts}
          context={model.context}
          onGo={scroll.toBlock}
        />
      )}
    </div>
  );
}

/** How long a Drawer takes to slide away, in ms, before what a tap in it opens. */
const AFTER_DRAWER = 400;

/**
 * Draws nothing: says once that the session can be drawn whole, all of it
 * read from this device, so the frame first draws it with its transcript and
 * its Draft.
 */
export const SessionReady = View.make(SessionLive, (self) => (
  <Read.Around value={<Ready {...self} />}>
    <Read.view instance={self.children.transcript} />
  </Read.Around>
));

function Ready({ model, props, children, send }: Self) {
  const { found, messages, windows } = Read.useRead();
  const restored = useChild(children.draft, ({ model }) => model.restored);
  const ready = readyOf({
    sessionId: props.params.sessionId,
    model,
    found: found && {
      status: found.status,
      held: found.rows.length > 0,
    },
    messages: messages && { status: messages.status },
    earlier: windows.map(({ model }) => ({ status: model.status })),
    restored,
  });
  const held = found !== undefined && found.rows.length > 0;
  useEffect(() => {
    if (ready && (!model.ready || (held && !model.held)))
      send({ _tag: 'Ready', held });
  }, [ready, held, model.ready, model.held]);
  return null;
}

/**
 * Away from the bottom, a way back: a small round arrow centred over the
 * Draft that glides to the very bottom and follows from there. It fades
 * and rises in, and is gone, not merely hidden, from the keys while away.
 * Raised off the page, it still stands out over a dark code block.
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
        size="icon"
        aria-label="Scroll to bottom"
        title="Scroll to bottom"
        onClick={onClick}
        data-shown={shown ? '' : undefined}
        className="pointer-events-auto size-10 translate-y-2 rounded-full border-foreground/15 bg-card text-foreground opacity-0 shadow-[0_2px_4px_rgb(0_0_0/0.06),0_6px_16px_rgb(0_0_0/0.12)] transition-[opacity,translate,background-color] duration-200 ease-out hover:bg-muted data-shown:translate-y-0 data-shown:opacity-100 dark:bg-secondary dark:shadow-[0_2px_4px_rgb(0_0_0/0.3),0_8px_20px_rgb(0_0_0/0.5)] pointer-coarse:size-11 keyboard:size-8 motion-reduce:transition-none"
      >
        <ArrowDownIcon aria-hidden className="size-4" />
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
  connectionId,
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
  readonly content: Scroller['content'];
  readonly connectionId: string;
  readonly session: Session | undefined;
  /** The title of the session it was forked from; null until its chain is read. */
  readonly original: string | null;
  readonly missing: boolean;
  readonly reading: boolean;
  readonly waiting: boolean;
  readonly earlier: ReturnType<typeof earlierOf> | null;
  readonly rows: ReturnType<typeof useRows>;
  readonly opening: Opening;
  readonly forking: Forking;
  readonly running: boolean;
  readonly ready: boolean;
  readonly offline: string | null;
}) {
  const accountId = routes.useAccountId();
  return (
    <div
      ref={content}
      className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-14 pb-10 sm:px-6"
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
                accountId,
                connectionId,
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
      ) : reading || waiting ? (
        // Nothing to draw yet: said once the wait is long enough to see,
        // the same line from reading this device to syncing, so it never
        // starts over between them.
        <Loading>Loading session…</Loading>
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
      {/* Said only to a screen reader: the header's pill says on screen
          that the server is out of reach. Working, the turn's own status
          says so. */}
      {running && ready && offline !== null && (
        <p role="status" className="sr-only">
          Last seen working. Updates resume when the server is back.
        </p>
      )}
    </div>
  );
});

export default SessionView;
