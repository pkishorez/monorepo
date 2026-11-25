import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { ArrowLeftIcon, PlayIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import type { Video } from '../../../../video/library/schema.ts';
import { Pages, router } from '../../../shared/index.ts';
import { isWorking, lengthsOf, shorterOf, span } from '../../format/index.ts';
import { ConfirmDelete, Status } from '../parts/index.ts';
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

function Header({
  video,
  model,
  send,
}: {
  readonly video: Video;
  readonly model: Self['model'];
  readonly send: Self['send'];
}) {
  const shorter = shorterOf(video);
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1
            className={`text-xl font-semibold tracking-tight text-balance sm:text-2xl ${video.title === null ? 'font-mono break-all' : ''}`}
          >
            {video.title ?? video.id}
          </h1>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
            {[video.channel, `${video.strength} cut`, lengthsOf(video), shorter]
              .filter(Boolean)
              .map((part, index) => (
                <span key={index} className="tabular-nums">
                  {index > 0 && (
                    <span aria-hidden className="mr-2">
                      ·
                    </span>
                  )}
                  {part}
                </span>
              ))}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto">
          <Status video={video} />
          {model.busy && <Spinner className="text-muted-foreground" />}
          <span className="flex-1 sm:hidden" />
          {isWorking(video) && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 px-3 sm:pointer-fine:h-8"
              disabled={model.busy}
              onClick={() => send({ _tag: 'Act', action: 'stop' })}
            >
              <SquareIcon /> Stop
            </Button>
          )}
          {(video.state === 'stopped' || video.state === 'failed') && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 px-3 sm:pointer-fine:h-8"
              disabled={model.busy}
              onClick={() => send({ _tag: 'Act', action: 'resume' })}
            >
              <PlayIcon /> Resume
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={model.busy}
            className="h-11 px-3 text-muted-foreground hover:text-destructive sm:pointer-fine:h-8"
            onClick={() => send({ _tag: 'Confirm' })}
          >
            <Trash2Icon /> Delete
          </Button>
        </div>
      </div>
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
    return (
      <div {...root} className="space-y-4 sm:space-y-6">
        <Router.Link
          to={router.List()}
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> All videos
        </Router.Link>
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
            <Header video={video} model={model} send={send} />
            {model.unread !== null && (
              <p role="alert" className="text-sm text-destructive">
                {model.unread}
              </p>
            )}
            {video.state === 'done' ? (
              <Watch id={id} model={model} send={send} />
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
