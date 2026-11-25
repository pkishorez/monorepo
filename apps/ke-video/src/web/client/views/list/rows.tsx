import { Router } from '@kestack/kabuki/routing';
import type { ViewProps } from '@kestack/kabuki/react/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kestack/web-platform/ui/components/dropdown-menu';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { EllipsisIcon, PlayIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import type { Video } from '../../../../video/library/schema.ts';
import { router, type Pages } from '../../../shared/index.ts';
import { isWorking, lengthsOf } from '../../format/index.ts';
import { Status } from '../parts/index.ts';

type Self = ViewProps<typeof Pages.ListLive>;

const ITEM = 'min-h-11 gap-2.5 px-3 sm:pointer-fine:min-h-9';

/** What can be done to a Video now, behind one button a thumb finds. */
function Actions({
  video,
  busy,
  send,
}: {
  readonly video: Video;
  readonly busy: boolean;
  readonly send: Self['send'];
}) {
  if (busy)
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center"
        aria-label="Working on it"
      >
        <Spinner className="text-muted-foreground" />
      </span>
    );
  const name = video.title ?? video.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label={`Actions for ${name}`}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {isWorking(video) && (
          <DropdownMenuItem
            className={ITEM}
            onClick={() => send({ _tag: 'Act', id: video.id, action: 'stop' })}
          >
            <SquareIcon /> Stop
          </DropdownMenuItem>
        )}
        {(video.state === 'stopped' || video.state === 'failed') && (
          <DropdownMenuItem
            className={ITEM}
            onClick={() =>
              send({ _tag: 'Act', id: video.id, action: 'resume' })
            }
          >
            <PlayIcon /> Resume
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          className={ITEM}
          onClick={() => send({ _tag: 'Confirm', id: video.id })}
        >
          <Trash2Icon /> Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One Video. On a phone, two lines: the title, then its status and
 * lengths; from a tablet up, one line with each in its column.
 */
function Row({
  video,
  busy,
  refused,
  send,
}: {
  readonly video: Video;
  readonly busy: boolean;
  readonly refused: string | null;
  readonly send: Self['send'];
}) {
  const lengths = lengthsOf(video);
  return (
    <li className="py-2 pr-1.5 pl-4">
      <div className="flex items-center gap-2">
        <Router.Link
          to={router.Video({ id: video.id })}
          className="grid min-w-0 flex-1 gap-1 rounded-sm py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[minmax(0,1fr)_7rem_13rem] sm:items-center sm:gap-4"
        >
          <span className="min-w-0">
            <span
              className={`line-clamp-2 font-medium text-pretty sm:line-clamp-1 ${video.title === null ? 'font-mono text-sm break-all' : ''}`}
            >
              {video.title ?? video.id}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {[
                video.channel,
                video.strength,
                isWorking(video) ? video.latest : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className="flex min-w-0 items-start justify-between gap-3 sm:contents">
            <span className="order-2 shrink-0 text-sm text-muted-foreground tabular-nums sm:order-none sm:text-right">
              {lengths}
            </span>
            <span className="flex min-w-0 sm:order-none">
              <Status video={video} />
            </span>
          </span>
        </Router.Link>
        <Actions video={video} busy={busy} send={send} />
      </div>
      {refused !== null && (
        <p role="alert" className="mt-1 pr-2.5 text-sm text-destructive">
          {refused}
        </p>
      )}
    </li>
  );
}

export function Rows({
  model,
  send,
  videos,
}: Pick<Self, 'model' | 'send'> & { readonly videos: ReadonlyArray<Video> }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {videos.map((video) => (
        <Row
          key={video.id}
          video={video}
          busy={model.busy.includes(video.id)}
          refused={model.refused?.id === video.id ? model.refused.error : null}
          send={send}
        />
      ))}
    </ul>
  );
}
