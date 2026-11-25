import type { Video } from '../../../../video/library/schema.ts';
import { statusOf } from '../../format/index.ts';

const TONE: Readonly<Record<Video['state'], string>> = {
  queued: 'text-muted-foreground',
  running: 'text-running',
  stopped: 'text-muted-foreground',
  failed: 'text-destructive',
  done: 'text-positive',
};

/** A Video's status in words, with a thin bar under it while a step counts. */
export function Status({ video }: { readonly video: Video }) {
  const counting = video.state === 'running' && video.progress !== null;
  return (
    <span className="inline-flex min-w-0 flex-col gap-1">
      <span
        className={`text-sm whitespace-nowrap tabular-nums ${TONE[video.state]}`}
      >
        {statusOf(video)}
      </span>
      {counting && (
        <span className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-running transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.round((video.progress ?? 0) * 100)}%` }}
          />
        </span>
      )}
    </span>
  );
}
