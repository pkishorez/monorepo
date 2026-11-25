import { useEffect, useState } from 'react';
import { View } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  ChevronLeftIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Video } from '../../../../video/library/schema.ts';
import { Pages, router, type Route } from '../../../shared/index.ts';
import { isWorking, lengthsOf, shorterOf, span } from '../../format/index.ts';
import { AppBar, ConfirmDelete, Status } from '../parts/index.ts';
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
 * Back to the list. Come from it, this goes back in history, as the
 * browser's back and the iOS edge swipe do, so the list keeps its scroll;
 * opened straight from a link, it opens the list.
 */
function Back() {
  const { entries, at, back } = useRouter<Route>();
  const from = entries[at - 1]?.route;
  return (
    <Router.Link
      to={router.List()}
      onClick={(event) => {
        if (from?._tag !== 'List') return;
        event.preventDefault();
        back();
      }}
      className="-ml-2 flex min-h-11 shrink-0 items-center gap-0.5 rounded-md pr-2 pl-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChevronLeftIcon className="size-5" aria-hidden /> Videos
    </Router.Link>
  );
}

/** Whether the page's title has scrolled up under the app bar. */
const useTitleGone = (title: HTMLElement | null) => {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (title === null) return;
    const bar =
      document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const seen = new IntersectionObserver(
      ([entry]) => entry && setGone(!entry.isIntersecting),
      { rootMargin: `-${Math.round(bar)}px 0px 0px 0px` },
    );
    seen.observe(title);
    return () => seen.disconnect();
  }, [title]);
  return gone;
};

/** The way back, and the title once the page's own has scrolled away. */
function Bar({
  name,
  title,
}: {
  readonly name: string | null;
  readonly title: HTMLElement | null;
}) {
  const gone = useTitleGone(title);
  return (
    <AppBar>
      <Back />
      {name !== null && (
        <span
          aria-hidden={!gone}
          className={`min-w-0 truncate text-sm font-medium transition-opacity duration-150 ease-out motion-reduce:transition-none ${gone ? 'opacity-100' : 'opacity-0'}`}
        >
          {name}
        </span>
      )}
    </AppBar>
  );
}

function Header({
  video,
  model,
  send,
  title,
}: {
  readonly video: Video;
  readonly model: Self['model'];
  readonly send: Self['send'];
  readonly title: (element: HTMLElement | null) => void;
}) {
  const shorter = shorterOf(video);
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1
            ref={title}
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
    const [title, setTitle] = useState<HTMLElement | null>(null);
    return (
      <div {...root} className="space-y-4 sm:space-y-6">
        <Bar
          name={video === null ? null : (video.title ?? video.id)}
          title={title}
        />
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
            <Header video={video} model={model} send={send} title={setTitle} />
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
