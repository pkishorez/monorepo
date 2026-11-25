import { useState, useSyncExternalStore } from 'react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kestack/web-platform/ui/components/tabs';
import { mediaOf, type Pages } from '../../../../shared/index.ts';
import { Cuts } from './cuts.tsx';
import { Player } from './player.ts';
import { DoubleTap } from './skip.tsx';
import { Chapters, Summary } from './summary.tsx';
import { Panels, Underline, useTrack } from './track.tsx';
import { Transcript } from './transcript.tsx';

type Self = ViewProps<typeof Pages.VideoLive>;
type Panel = Self['model']['panel'];
type Outputs = NonNullable<Self['model']['outputs']>;

const NARROW: ReadonlyArray<Panel> = ['transcript', 'summary', 'cuts'];
const WIDE: ReadonlyArray<Panel> = ['transcript', 'cuts'];

const LAPTOP = '(min-width: 64rem)';

/** Whether the page is laid out for a laptop: the summary beside the video, not in a tab. */
const useWide = () =>
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

/**
 * A finished Video. On a phone or tablet, under the app bar and kept
 * there: the short video, edge to edge on a phone, then the tabs; under
 * them the transcript, the summary with its chapters, and the cuts, a
 * swipe apart. From a laptop up: the video, its chapters and the summary
 * on the left; on the right, kept in view, the transcript or the cuts.
 */
export function Watch({
  id,
  model,
  send,
}: {
  readonly id: string;
  readonly model: Self['model'];
  readonly send: Self['send'];
}) {
  const [player] = useState(() => new Player());
  const wide = useWide();
  const { outputs } = model;
  return (
    <div className="grid gap-y-0 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_29rem]">
      <div className="sticky top-(--stack-bar) z-30 -mx-4 h-(--player-h) bg-black sm:mx-0 sm:rounded-lg lg:static lg:col-start-1 lg:row-start-1 lg:h-auto lg:bg-transparent">
        <DoubleTap player={player}>
          <video
            ref={player.attach}
            // A start just past 0 has Safari draw the first frame as the poster.
            src={`${mediaOf(id, 'video')}#t=0.001`}
            controls
            playsInline
            preload="metadata"
            className="block h-full w-full bg-black sm:rounded-lg lg:aspect-video lg:h-auto"
          />
        </DoubleTap>
      </div>
      {outputs !== null && (
        <div className="hidden min-w-0 space-y-8 lg:col-start-1 lg:row-start-2 lg:block">
          <Chapters chapters={outputs.summary.chapters} player={player} />
          <Summary summary={outputs.summary} player={player} />
        </div>
      )}
      <aside className="flex min-w-0 flex-col lg:sticky lg:top-[calc(var(--stack-bar)+1.5rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-var(--stack-bar)-3rem)] lg:self-start">
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
        ) : wide ? (
          <Side
            id={id}
            model={model}
            send={send}
            player={player}
            outputs={outputs}
          />
        ) : (
          <Swiped
            id={id}
            model={model}
            send={send}
            player={player}
            outputs={outputs}
          />
        )}
      </aside>
    </div>
  );
}

type Shown = {
  readonly id: string;
  readonly model: Self['model'];
  readonly send: Self['send'];
  readonly player: Player;
  readonly outputs: Outputs;
};

/** What a tab holds; `active` while it is the one open. */
function Content({
  tab,
  active,
  id,
  model,
  send,
  player,
  outputs,
}: Shown & { readonly tab: Panel; readonly active: boolean }) {
  switch (tab) {
    case 'transcript':
      return (
        <Transcript
          lines={outputs.transcript.trimmed}
          player={player}
          active={active}
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
function Swiped(shown: Shown) {
  const { model, send } = shown;
  const open = NARROW.includes(model.panel) ? model.panel : 'transcript';
  const track = useTrack(NARROW, open, (panel) =>
    send({ _tag: 'Show', panel }),
  );
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
          {NARROW.map((panel) => (
            <TabsTrigger
              key={panel}
              value={panel}
              className="h-full flex-1 rounded-none px-3 after:hidden"
            >
              {LABEL[panel]}
              {panel === 'cuts' && <Count outputs={shown.outputs} />}
            </TabsTrigger>
          ))}
          <Underline track={track} count={NARROW.length} />
        </TabsList>
      </div>
      <Panels
        track={track}
        shown={NARROW}
        open={open}
        panel={(tab, active) => (
          <div role="tabpanel" aria-label={LABEL[tab]}>
            <Content tab={tab} active={active} {...shown} />
          </div>
        )}
      />
    </Tabs>
  );
}

/** A laptop's side column: the transcript or the cuts, each scrolling in its own box. */
function Side(shown: Shown) {
  const { model, send } = shown;
  const open = WIDE.includes(model.panel) ? model.panel : 'transcript';
  return (
    <Tabs
      value={open}
      onValueChange={(panel: Panel) => send({ _tag: 'Show', panel })}
      className="min-h-0 flex-1"
    >
      <div data-pinned>
        <TabsList className="w-full group-data-horizontal/tabs:h-auto lg:w-fit lg:pointer-fine:group-data-horizontal/tabs:h-9">
          {WIDE.map((panel) => (
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
      {WIDE.map((panel) => (
        <TabsContent key={panel} value={panel} className="min-h-0 flex-1">
          <Content tab={panel} active={panel === open} {...shown} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
