import { type ReactElement, useEffect, useState } from 'react';
import type { ViewProps } from '@kestack/kabuki/react/types';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kestack/web-platform/ui/components/dropdown-menu';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kestack/web-platform/ui/components/tooltip';
import {
  ChevronLeftIcon,
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlayIcon,
  RectangleHorizontalIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Video } from '../../../../video/library/schema.ts';
import { type Pages, router, type Route } from '../../../shared/index.ts';
import { isWorking } from '../../format/index.ts';
import { Keep, useSettings } from '../../keep/index.ts';
import { AppBar } from '../parts/index.ts';

/*
 * A Video's app bar, kept at the top as the page scrolls: on its left the
 * way back, then the title once the page's own has scrolled away; on its
 * right, once the Video is done, the switches for how it is laid out, and
 * a menu of what can be done to it: stop, resume, delete.
 */

type Self = ViewProps<typeof Pages.VideoLive>;

const ITEM = 'min-h-11 pointer-fine:min-h-8';

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

/** Whether a key press belongs to what has focus, as typing does. */
const typing = (event: KeyboardEvent) => {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [role=menu], [role=dialog]') !==
        null)
  );
};

/** An icon button that says what it does on hover, with its key if it has one. */
function Tip({
  label,
  keys,
  children,
}: {
  readonly label: string;
  readonly keys?: string;
  readonly children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">
        {label}
        {keys !== undefined && <Kbd>{keys}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

const TOGGLE =
  'size-11 shrink-0 text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground pointer-fine:size-9';

/**
 * How a done Video is laid out: wide, from a laptop up, and immersive,
 * at every width. `I` turns immersive on and off; Esc leaves it.
 */
function Modes() {
  const settings = useSettings();
  const immersive = settings.immersive ?? false;
  const wide = settings.layout === 'wide';

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || typing(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const now = Keep.settings.read().immersive ?? false;
      if (event.key === 'i' || event.key === 'I')
        Keep.settings.change({ immersive: !now });
      else if (event.key === 'Escape' && now)
        Keep.settings.change({ immersive: false });
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  return (
    <>
      {!immersive && (
        <Tip label={wide ? 'Video beside the transcript' : 'Wide video'}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Wide video"
            aria-pressed={wide}
            onClick={() =>
              Keep.settings.change({ layout: wide ? 'side' : 'wide' })
            }
            className={`hidden lg:inline-flex ${TOGGLE}`}
          >
            <RectangleHorizontalIcon />
          </Button>
        </Tip>
      )}
      <Tip
        label={
          immersive
            ? 'Leave immersive'
            : 'Immersive: video, transcript and cuts only'
        }
        keys="I"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Immersive"
          aria-pressed={immersive}
          onClick={() => Keep.settings.change({ immersive: !immersive })}
          className={TOGGLE}
        >
          {immersive ? <Minimize2Icon /> : <Maximize2Icon />}
        </Button>
      </Tip>
    </>
  );
}

/** What can be done to the Video, in reach however far the page has scrolled. */
function Actions({
  video,
  model,
  send,
}: {
  readonly video: Video;
  readonly model: Self['model'];
  readonly send: Self['send'];
}) {
  if (model.busy)
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center pointer-fine:size-9"
        aria-label="Working on it"
      >
        <Spinner className="text-muted-foreground" />
      </span>
    );
  const stop = isWorking(video);
  const resume = video.state === 'stopped' || video.state === 'failed';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground pointer-fine:size-9"
            aria-label="Actions for this video"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {stop && (
          <DropdownMenuItem
            className={ITEM}
            onClick={() => send({ _tag: 'Act', action: 'stop' })}
          >
            <SquareIcon /> Stop
          </DropdownMenuItem>
        )}
        {resume && (
          <DropdownMenuItem
            className={ITEM}
            onClick={() => send({ _tag: 'Act', action: 'resume' })}
          >
            <PlayIcon /> Resume
          </DropdownMenuItem>
        )}
        {(stop || resume) && <DropdownMenuSeparator />}
        <DropdownMenuItem
          variant="destructive"
          className={ITEM}
          onClick={() => send({ _tag: 'Confirm' })}
        >
          <Trash2Icon /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The way back, the title once the page's own has scrolled away, and the Video's switches and actions. */
export function Bar({
  video,
  model,
  send,
  title,
}: {
  readonly video: Video | null;
  readonly model: Self['model'];
  readonly send: Self['send'];
  readonly title: HTMLElement | null;
}) {
  const settings = useSettings();
  const gone = useTitleGone(title) || (settings.immersive ?? false);
  const name = video === null ? null : (video.title ?? video.id);
  return (
    <AppBar>
      <Back />
      <span
        aria-hidden={!gone}
        className={`min-w-0 flex-1 truncate text-sm font-medium transition-opacity duration-150 ease-out motion-reduce:transition-none ${gone && name !== null ? 'opacity-100' : 'opacity-0'}`}
      >
        {name}
      </span>
      {video?.state === 'done' && <Modes />}
      {video !== null && <Actions video={video} model={model} send={send} />}
    </AppBar>
  );
}
