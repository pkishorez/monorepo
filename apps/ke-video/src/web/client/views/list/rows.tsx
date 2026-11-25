import { useCallback, useState } from 'react';
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
import { ACTION_WIDTH } from '../../touch/index.ts';
import { Status } from '../parts/index.ts';
import { SwipeRow, useShut } from './swipe.tsx';

type Self = ViewProps<typeof Pages.ListLive>;
type Action = 'stop' | 'resume' | 'delete';

const ITEM = 'min-h-11 gap-2.5 px-3 sm:pointer-fine:min-h-9';

/** What can be done to a Video now: stop it while it works, resume it once stopped or failed, and always delete it. */
const actionsOf = (video: Video): ReadonlyArray<Action> => [
  ...(isWorking(video) ? (['stop'] as const) : []),
  ...(video.state === 'stopped' || video.state === 'failed'
    ? (['resume'] as const)
    : []),
  'delete',
];

const SHOWN: Readonly<
  Record<Action, { readonly label: string; readonly tone: string }>
> = {
  stop: { label: 'Stop', tone: 'bg-muted text-foreground' },
  resume: { label: 'Resume', tone: 'bg-muted text-foreground' },
  delete: {
    label: 'Delete',
    tone: 'bg-destructive text-white dark:text-background',
  },
};

function ActionIcon({ action }: { readonly action: Action }) {
  switch (action) {
    case 'stop':
      return <SquareIcon />;
    case 'resume':
      return <PlayIcon />;
    case 'delete':
      return <Trash2Icon />;
  }
}

/** The buttons a swipe shows behind a row; a delete still asks first. */
function Behind({
  video,
  send,
  onDone,
}: {
  readonly video: Video;
  readonly send: Self['send'];
  readonly onDone: () => void;
}) {
  return actionsOf(video).map((action) => (
    <button
      key={action}
      type="button"
      onClick={() => {
        onDone();
        send(
          action === 'delete'
            ? { _tag: 'Confirm', id: video.id }
            : { _tag: 'Act', id: video.id, action },
        );
      }}
      style={{ width: ACTION_WIDTH }}
      className={`flex h-full flex-col items-center justify-center gap-1 text-xs font-medium [&_svg]:size-4 ${SHOWN[action].tone}`}
    >
      <ActionIcon action={action} />
      {SHOWN[action].label}
    </button>
  ));
}

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
  open,
  onOpen,
  onShut,
}: {
  readonly video: Video;
  readonly busy: boolean;
  readonly refused: string | null;
  readonly send: Self['send'];
  readonly open: boolean;
  readonly onOpen: (id: string) => void;
  readonly onShut: () => void;
}) {
  const lengths = lengthsOf(video);
  return (
    <li>
      <SwipeRow
        id={video.id}
        open={open}
        width={actionsOf(video).length * ACTION_WIDTH}
        enabled={!busy}
        onOpen={() => onOpen(video.id)}
        onShut={onShut}
        actions={<Behind video={video} send={send} onDone={onShut} />}
      >
        <div className="flex items-center gap-2 py-2 pr-1.5 pl-4">
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
      </SwipeRow>
      {refused !== null && (
        <p role="alert" className="px-4 pb-2 text-sm text-destructive">
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
  // The row swiped open on its actions, by its Video's id: one at a time.
  const [open, setOpen] = useState<string | null>(null);
  const shut = useCallback(() => setOpen(null), []);
  useShut(open, shut);
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {videos.map((video) => (
        <Row
          key={video.id}
          video={video}
          busy={model.busy.includes(video.id)}
          refused={model.refused?.id === video.id ? model.refused.error : null}
          send={send}
          open={open === video.id}
          onOpen={setOpen}
          onShut={shut}
        />
      ))}
    </ul>
  );
}
