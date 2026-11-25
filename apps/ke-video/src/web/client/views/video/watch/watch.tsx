import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kestack/web-platform/ui/components/tabs';
import { mediaOf, type Pages } from '../../../../shared/index.ts';
import {
  Keep,
  STARTING,
  throttled,
  useSettings,
  type Watched,
} from '../../../keep/index.ts';
import { Cuts } from './cuts.tsx';
import { Player } from './player.ts';
import { Resumed, useResume } from './resume.tsx';
import { DoubleTap } from './skip.tsx';
import { Chapters, Summary } from './summary.tsx';
import { Panels, Underline, useTrack } from './track.tsx';
import { Transcript } from './transcript.tsx';

type Self = ViewProps<typeof Pages.VideoLive>;
type Panel = Self['model']['panel'];
type Outputs = NonNullable<Self['model']['outputs']>;

const NARROW: ReadonlyArray<Panel> = ['transcript', 'summary', 'cuts'];
const NARROW_IMMERSIVE: ReadonlyArray<Panel> = ['transcript', 'cuts'];
const SIDE: ReadonlyArray<Panel> = ['transcript', 'cuts'];

const LAPTOP = '(min-width: 64rem)';

/** Whether the page is laid out for a laptop: the transcript in a column of its own, not in a tab. */
const useLaptop = () =>
  useSyncExternalStore(
    (changed) => {
      const query = matchMedia(LAPTOP);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => matchMedia(LAPTOP).matches,
    () => false,
  );

const LABEL: Readonly<Record<Panel, string>> = {
  transcript: 'Transcript',
  summary: 'Summary',
  cuts: 'Cuts',
};

/** How a finished Video is laid out from a laptop up. */
type Mode = 'side' | 'wide' | 'immersive';

/*
 * Each part's classes in each mode. The parts stay the same elements
 * whatever the mode, so a switch never stops or restarts the video.
 *
 * - side       the video, its chapters and the summary on the left; on
 *              the right, kept in view, the transcript or the cuts.
 * - wide       the video across the page, as tall as the window allows
 *              with a little of what is below showing; under it, the
 *              title, chapters and summary, and the transcript or cuts
 *              kept in view beside them.
 * - immersive  the video and the transcript or cuts alone, filling the
 *              window under the app bar.
 */
const GRID: Readonly<Record<Mode, string>> = {
  side: 'lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_29rem]',
  wide: 'lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_29rem]',
  immersive:
    'max-lg:-mt-5 sm:max-lg:-mt-8 lg:fixed lg:inset-x-0 lg:top-(--stack-bar) lg:bottom-0 lg:z-30 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[minmax(0,1fr)] lg:bg-background xl:grid-cols-[minmax(0,1fr)_28rem]',
};
const STAGE: Readonly<Record<Mode, string>> = {
  side: 'lg:col-start-1 lg:row-start-1 lg:h-auto lg:bg-transparent',
  wide: 'lg:col-span-2 lg:row-start-1 lg:mx-auto lg:h-auto lg:w-full lg:max-w-[calc((100dvh-var(--stack-bar)-7rem)*16/9)] lg:bg-transparent',
  immersive:
    'lg:col-start-1 lg:row-start-1 lg:h-full lg:rounded-none lg:bg-black',
};
const VIDEO: Readonly<Record<Mode, string>> = {
  side: 'lg:aspect-video lg:h-auto',
  wide: 'lg:aspect-video lg:h-auto',
  immersive: 'lg:h-full lg:rounded-none',
};
const ASIDE: Readonly<Record<Mode, string>> = {
  side: 'lg:sticky lg:top-[calc(var(--stack-bar)+1.5rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-var(--stack-bar)-3rem)] lg:self-start',
  wide: 'lg:sticky lg:top-[calc(var(--stack-bar)+1.5rem)] lg:col-start-2 lg:row-start-2 lg:h-[calc(100dvh-var(--stack-bar)-3rem)] lg:self-start',
  immersive:
    'lg:col-start-2 lg:row-start-1 lg:h-full lg:min-h-0 lg:border-l lg:border-border lg:px-4 lg:pt-3 lg:pb-[max(1rem,env(safe-area-inset-bottom))]',
};

/**
 * Where each list was read, kept as it changes, at most twice a second,
 * and at once as the page goes; and whether the transcript followed.
 */
const useKeptRows = (id: string) => {
  const [kept] = useState(() => {
    const rows: { transcript?: number; cuts?: number } = {};
    const save = throttled(
      () => Keep.watched.change(id, { rows: { ...rows } }),
      500,
    );
    return {
      transcript: (row: number) => {
        rows.transcript = row;
        save.call();
      },
      cuts: (row: number) => {
        rows.cuts = row;
        save.call();
      },
      following: (following: boolean) => Keep.watched.change(id, { following }),
      flush: save.flush,
    };
  });
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') kept.flush();
    };
    addEventListener('pagehide', kept.flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      kept.flush();
      removeEventListener('pagehide', kept.flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [kept]);
  return kept;
};

/**
 * The cut whose clip was open, open again once the cuts are read, if the
 * kind shown has it; then kept as it changes.
 */
const useKeptClip = (
  id: string,
  start: Watched,
  model: Self['model'],
  send: Self['send'],
) => {
  const restored = useRef(false);
  const { outputs, playing, filter } = model;
  useEffect(() => {
    if (restored.current || outputs === null) return;
    restored.current = true;
    const cut = start.playing;
    const kind =
      cut === undefined || cut === null
        ? undefined
        : outputs.cuts.removed[cut]?.kind;
    if (
      cut !== undefined &&
      cut !== null &&
      kind !== undefined &&
      (filter === 'all' || filter === kind) &&
      playing === null
    )
      send({ _tag: 'Play', cut });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, as the cuts arrive.
  }, [outputs]);
  useEffect(() => {
    if (restored.current) Keep.watched.change(id, { playing });
  }, [id, playing]);
};

/**
 * A finished Video. On a phone or tablet, under the app bar and kept
 * there: the short video, edge to edge on a phone, then the tabs; under
 * them the transcript, the summary with its chapters, and the cuts, a
 * swipe apart, or only the transcript and cuts when immersive. From a
 * laptop up, as its Mode lays it out. Where it was watched and read is
 * kept, and found again after a reload. The page's `header` goes above
 * it, or under a wide video, and not at all when immersive.
 */
export function Watch({
  id,
  model,
  send,
  header,
}: {
  readonly id: string;
  readonly model: Self['model'];
  readonly send: Self['send'];
  readonly header: ReactNode;
}) {
  const [player] = useState(() => new Player());
  const [start] = useState(() => Keep.watched.read(id));
  // Where the video opens: where it was left, else just past 0, which has
  // Safari draw that frame as the poster. Safari applies the URL's start
  // after the first seek, so the start is the resume itself.
  const [from] = useState(() =>
    start.time !== undefined && start.time >= STARTING ? start.time : 0.001,
  );
  const laptop = useLaptop();
  const settings = useSettings();
  const immersive = settings.immersive ?? false;
  const mode: Mode = immersive ? 'immersive' : (settings.layout ?? 'side');
  const { resumed, startOver } = useResume(player, id);
  const rows = useKeptRows(id);
  useKeptClip(id, start, model, send);
  const { outputs } = model;
  const shown: Omit<Shown, 'outputs'> = {
    id,
    model,
    send,
    player,
    start,
    resumed,
    rows,
  };
  const under = laptop && mode === 'wide';
  return (
    <>
      {mode !== 'immersive' && !under && header}
      <div className={`grid gap-y-0 ${GRID[mode]}`}>
        <div
          className={`sticky top-(--stack-bar) z-30 -mx-4 h-(--player-h) bg-black sm:mx-0 sm:rounded-lg short-landscape:relative short-landscape:top-0 short-landscape:z-auto lg:relative lg:top-0 lg:z-auto ${STAGE[mode]}`}
        >
          <DoubleTap player={player}>
            <video
              ref={player.attach}
              src={`${mediaOf(id, 'video')}#t=${from}`}
              controls
              playsInline
              preload="metadata"
              className={`block h-full w-full bg-black sm:rounded-lg ${VIDEO[mode]}`}
            />
          </DoubleTap>
          <Resumed at={resumed} onStartOver={startOver} />
        </div>
        {mode !== 'immersive' && (
          <div className="hidden min-w-0 space-y-8 lg:col-start-1 lg:row-start-2 lg:block">
            {under && header}
            {outputs !== null && (
              <>
                <Chapters chapters={outputs.summary.chapters} player={player} />
                <Summary summary={outputs.summary} player={player} />
              </>
            )}
          </div>
        )}
        <aside className={`flex min-w-0 flex-col ${ASIDE[mode]}`}>
          {outputs === null ? (
            model.unloaded === null ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Spinner /> Reading the transcript, summary and cuts…
              </p>
            ) : (
              <p role="alert" className="py-4 text-sm text-destructive">
                {model.unloaded}
              </p>
            )
          ) : laptop ? (
            <Side {...shown} outputs={outputs} />
          ) : (
            <Swiped
              {...shown}
              outputs={outputs}
              tabs={immersive ? NARROW_IMMERSIVE : NARROW}
            />
          )}
        </aside>
      </div>
    </>
  );
}

type Shown = {
  readonly id: string;
  readonly model: Self['model'];
  readonly send: Self['send'];
  readonly player: Player;
  readonly outputs: Outputs;
  /** Where it was left before the page was drawn. */
  readonly start: Watched;
  /** Where the video resumed, while that shows. */
  readonly resumed: number | null;
  readonly rows: ReturnType<typeof useKeptRows>;
};

/** What a tab holds; `active` while it is the one open. */
function Content({
  tab,
  active,
  visible,
  id,
  model,
  send,
  player,
  outputs,
  start,
  resumed,
  rows,
}: Shown & {
  readonly tab: Panel;
  readonly active: boolean;
  readonly visible: boolean;
}) {
  switch (tab) {
    case 'transcript':
      return (
        <Transcript
          lines={outputs.transcript.trimmed}
          player={player}
          active={active}
          visible={visible}
          start={{
            ...(start.following === undefined
              ? {}
              : { following: start.following }),
            ...(start.rows?.transcript === undefined
              ? {}
              : { row: start.rows.transcript }),
          }}
          resumed={resumed}
          onFollow={rows.following}
          onTop={rows.transcript}
        />
      );
    case 'summary':
      return (
        <div className="space-y-8 pt-4">
          <Chapters chapters={outputs.summary.chapters} player={player} />
          <Summary summary={outputs.summary} player={player} />
        </div>
      );
    case 'cuts':
      return (
        <Cuts
          id={id}
          cuts={outputs.cuts}
          filter={model.filter}
          playing={model.playing}
          clip={model.clip}
          send={send}
          onPlay={player.pause}
          active={active}
          visible={visible}
          start={{
            ...(start.rows?.cuts === undefined ? {} : { row: start.rows.cuts }),
            ...(start.playing === undefined ? {} : { playing: start.playing }),
          }}
          onTop={rows.cuts}
        />
      );
  }
}

function Count({ outputs }: { readonly outputs: Outputs }) {
  return (
    <span className="text-muted-foreground tabular-nums">
      {outputs.cuts.removed.length}
    </span>
  );
}

/**
 * A phone's or tablet's tabs, kept under the player, with an underline
 * that follows a swipe, over their panels side by side.
 */
function Swiped({
  tabs,
  ...shown
}: Shown & { readonly tabs: ReadonlyArray<Panel> }) {
  const { model, send } = shown;
  const open = tabs.includes(model.panel) ? model.panel : 'transcript';
  const track = useTrack(tabs, open, (panel) => send({ _tag: 'Show', panel }));
  return (
    <Tabs
      value={open}
      onValueChange={(panel: Panel) => track.choose(panel)}
      className="gap-0"
    >
      <div
        data-pinned
        className="sticky top-(--stack-tabs) z-20 -mx-4 h-(--tabs-h) border-b border-border bg-background sm:mx-0"
      >
        <TabsList
          variant="line"
          className="relative h-full w-full gap-0 p-0 group-data-horizontal/tabs:h-full"
        >
          {tabs.map((panel) => (
            <TabsTrigger
              key={panel}
              value={panel}
              className="h-full flex-1 rounded-none px-3 after:hidden"
            >
              {LABEL[panel]}
              {panel === 'cuts' && <Count outputs={shown.outputs} />}
            </TabsTrigger>
          ))}
          <Underline track={track} count={tabs.length} />
        </TabsList>
      </div>
      <Panels
        track={track}
        shown={tabs}
        open={open}
        panel={(tab, active, visible) => (
          <div role="tabpanel" aria-label={LABEL[tab]}>
            <Content tab={tab} active={active} visible={visible} {...shown} />
          </div>
        )}
      />
    </Tabs>
  );
}

/** A laptop's side column: the transcript or the cuts, each scrolling in its own box. */
function Side(shown: Shown) {
  const { model, send } = shown;
  const open = SIDE.includes(model.panel) ? model.panel : 'transcript';
  return (
    <Tabs
      value={open}
      onValueChange={(panel: Panel) => send({ _tag: 'Show', panel })}
      className="min-h-0 flex-1"
    >
      <div data-pinned>
        <TabsList className="w-full group-data-horizontal/tabs:h-auto lg:w-fit lg:pointer-fine:group-data-horizontal/tabs:h-9">
          {SIDE.map((panel) => (
            <TabsTrigger
              key={panel}
              value={panel}
              className="h-11 flex-1 px-3 lg:flex-none lg:pointer-fine:h-[calc(100%-1px)]"
            >
              {LABEL[panel]}
              {panel === 'cuts' && <Count outputs={shown.outputs} />}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {SIDE.map((panel) => (
        <TabsContent key={panel} value={panel} className="min-h-0 flex-1">
          <Content
            tab={panel}
            active={panel === open}
            visible={panel === open}
            {...shown}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
