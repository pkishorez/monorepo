import { useEffect, useState } from 'react';
import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { Video } from '../../../../video/library/schema.ts';
import { Pages } from '../../../shared/index.ts';
import { lengthsOf, shorterOf, span } from '../../format/index.ts';
import { ConfirmDelete, Status } from '../parts/index.ts';
import { Bar } from './bar.tsx';
import { Watch } from './watch/index.ts';
import { Working } from './working.tsx';

type Self = ViewProps<typeof Pages.VideoLive>;

/** `3.5 s of silence, 10 s of ads, … in 5 cuts`. */
const removedOf = ({ removed, cuts }: NonNullable<Video['result']>) => {
  const parts = [
    [removed.silence, 'silence'],
    [removed.fillers, 'fillers'],
    [removed.ads, 'ads'],
    [removed.fillerTalk, 'filler talk'],
  ] as const;
  const said = parts
    .filter(([seconds]) => seconds > 0)
    .map(([seconds, what]) => `${span(seconds)} of ${what}`);
  return `Removed ${said.length === 0 ? 'nothing' : said.join(', ')} in ${cuts} ${cuts === 1 ? 'cut' : 'cuts'}.`;
};

/**
 * The Video's title, then what it is in one line that wraps between its
 * parts, then how it is getting on while it works, and what was removed
 * once it is done. Stop, resume and delete are in the app bar's menu.
 */
function Header({
  video,
  model,
  title,
}: {
  readonly video: Video;
  readonly model: Self['model'];
  readonly title: (element: HTMLElement | null) => void;
}) {
  const parts = [
    video.channel,
    `${video.strength} cut`,
    lengthsOf(video),
    shorterOf(video),
  ].filter(Boolean);
  return (
    <header className="space-y-3">
      <div className="min-w-0 space-y-1">
        <h1
          ref={title}
          className={`text-xl font-semibold tracking-tight text-balance sm:text-2xl ${video.title === null ? 'font-mono break-all' : ''}`}
        >
          {video.title ?? video.id}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {parts.map((part, index) => (
            // Each part keeps the dot after it, so a wrapped line never starts with one.
            <span key={index} className="tabular-nums">
              <span className="whitespace-nowrap">
                {part}
                {index < parts.length - 1 && (
                  <span aria-hidden className="mx-2">
                    ·
                  </span>
                )}
              </span>{' '}
            </span>
          ))}
        </p>
      </div>
      {video.state !== 'done' && (
        <div className="flex items-center gap-3">
          <Status video={video} />
          {model.busy && <Spinner className="text-muted-foreground" />}
        </div>
      )}
      {video.result !== null && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {removedOf(video.result)}
        </p>
      )}
      {model.refused !== null && (
        <p role="alert" className="text-sm text-destructive">
          {model.refused}
        </p>
      )}
    </header>
  );
}

export const VideoView = View.make(
  Pages.VideoLive,
  ({ root, model, send, props }) => {
    const { video } = model;
    const { id } = props.params;
    const [title, setTitle] = useState<HTMLElement | null>(null);
    // The URL's tab and kind, once the page's first answer is in: sent as
    // it first draws, a Message is not yet heard. The tabs show only later.
    const read = video !== null;
    useEffect(() => {
      if (read) send({ _tag: 'Opened', ...props.query });
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, as the first answer arrives.
    }, [read]);
    return (
      <div {...root} className="space-y-4 sm:space-y-6">
        <Bar video={video} model={model} send={send} title={title} />
        {video === null ? (
          model.unread === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Reading {id}…
            </p>
          ) : (
            <div role="alert" className="space-y-1">
              <h1 className="text-xl font-semibold">No video {id}</h1>
              <p className="text-sm text-muted-foreground">{model.unread}</p>
            </div>
          )
        ) : (
          <>
            {video.state === 'done' ? null : (
              <Header video={video} model={model} title={setTitle} />
            )}
            {model.unread !== null && (
              <p role="alert" className="text-sm text-destructive">
                {model.unread}
              </p>
            )}
            {video.state === 'done' ? (
              <Watch
                id={id}
                model={model}
                send={send}
                header={<Header video={video} model={model} title={setTitle} />}
              />
            ) : (
              <Working video={video} events={model.events} />
            )}
            <ConfirmDelete
              name={video.title ?? video.id}
              open={model.confirming}
              onCancel={() => send({ _tag: 'Cancel' })}
              onDelete={() => send({ _tag: 'Delete' })}
            />
          </>
        )}
      </div>
    );
  },
);
