import { useState } from 'react';
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
import { Chapters, Summary } from './summary.tsx';
import { Transcript } from './transcript.tsx';

type Self = ViewProps<typeof Pages.VideoLive>;
type Panel = Self['model']['panel'];

const TRIGGER =
  'h-11 flex-1 px-3 lg:flex-none lg:pointer-fine:h-[calc(100%-1px)]';

/**
 * A finished Video. On a phone or tablet: the short video pinned at the
 * top, edge to edge on a phone, and under it the tabs, pinned too, over
 * the transcript, the summary with its chapters, and the cuts. From a
 * laptop up: the video, its chapters and the summary on the left; on the
 * right, kept in view, the transcript or the cuts.
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
  const { outputs } = model;
  return (
    <div className="grid gap-y-2 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-8 xl:grid-cols-[minmax(0,1fr)_29rem]">
      <div className="sticky top-0 z-30 -mx-4 bg-background pt-[env(safe-area-inset-top)] sm:mx-0 lg:static lg:col-start-1 lg:row-start-1 lg:pt-0">
        <video
          ref={player.attach}
          // A start just past 0 has Safari draw the first frame as the poster.
          src={`${mediaOf(id, 'video')}#t=0.001`}
          controls
          playsInline
          preload="metadata"
          className="block h-[min(56.25vw,45dvh)] w-full bg-black sm:rounded-lg lg:aspect-video lg:h-auto"
        />
      </div>
      {outputs !== null && (
        <div className="hidden min-w-0 space-y-8 lg:col-start-1 lg:row-start-2 lg:block">
          <Chapters chapters={outputs.summary.chapters} player={player} />
          <Summary summary={outputs.summary} player={player} />
        </div>
      )}
      <aside className="flex min-w-0 flex-col lg:sticky lg:top-[4.5rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-6rem)] lg:self-start">
        {outputs === null ? (
          model.unloaded === null ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Spinner /> Reading the transcript, summary and cuts…
            </p>
          ) : (
            <p role="alert" className="py-3 text-sm text-destructive">
              {model.unloaded}
            </p>
          )
        ) : (
          <Tabs
            value={model.panel}
            onValueChange={(panel: Panel) => send({ _tag: 'Show', panel })}
            className="min-h-0 flex-1"
          >
            <div
              data-pinned
              className="sticky top-[calc(env(safe-area-inset-top)+min(56.25vw,45dvh))] z-20 -mx-4 bg-background px-4 py-2 sm:mx-0 sm:px-0 lg:static lg:py-0"
            >
              <TabsList className="w-full group-data-horizontal/tabs:h-auto lg:w-fit lg:pointer-fine:group-data-horizontal/tabs:h-9">
                <TabsTrigger value="transcript" className={TRIGGER}>
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="summary" className={`${TRIGGER} lg:hidden`}>
                  Summary
                </TabsTrigger>
                <TabsTrigger value="cuts" className={TRIGGER}>
                  Cuts{' '}
                  <span className="text-muted-foreground tabular-nums">
                    {outputs.cuts.removed.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="transcript" className="lg:min-h-0 lg:flex-1">
              <Transcript lines={outputs.transcript.trimmed} player={player} />
            </TabsContent>
            <TabsContent value="summary" className="space-y-8 pt-2 lg:hidden">
              <Chapters chapters={outputs.summary.chapters} player={player} />
              <Summary summary={outputs.summary} player={player} />
            </TabsContent>
            <TabsContent value="cuts" className="lg:min-h-0 lg:flex-1">
              <Cuts
                id={id}
                cuts={outputs.cuts}
                filter={model.filter}
                playing={model.playing}
                send={send}
                onPlay={player.pause}
              />
            </TabsContent>
          </Tabs>
        )}
      </aside>
    </div>
  );
}
