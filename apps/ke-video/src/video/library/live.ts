import { createHash } from 'node:crypto';
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { folders, socketPath } from '@kestack/cli-platform/files';
import { reach } from '@kestack/cli-platform/single';
import { DiskError, listVideos, readVideo } from './disk.ts';
import type { Video } from './schema.ts';

/*
 * Whether a Video's worker is live. Each worker holds a socket of its
 * Video's own, answering `stop`, and while it works, the one `busy` socket,
 * answering which Video it works on. A record can say `queued` or `running`
 * after its worker died without saying so; such a Video is reported
 * stopped.
 */

/** What a Video's worker answers on its socket. */
export const WorkerControl = RpcGroup.make(Rpc.make('stop'));

/** What the worker holding the busy socket answers: the id of its Video. */
export const Busy = RpcGroup.make(Rpc.make('who', { success: Schema.String }));

const runtime = () => folders({ app: 'ke-video', name: 'main' }).runtime;

/** The socket of the Video `id`'s worker; ids are hashed, since their case and marks make poor file names. */
export const workerSocket = (id: string) =>
  socketPath(
    runtime(),
    'ke-video',
    `worker-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`,
  );

/** The socket only the worker at work holds. */
export const busySocket = () => socketPath(runtime(), 'ke-video', 'busy');

/** Whether a worker of the Video `id` is live. */
export const isLive = (id: string) =>
  Effect.try({
    try: () => workerSocket(id),
    catch: (error) =>
      new DiskError({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(
    Effect.flatMap((path) => reach(path, WorkerControl)),
    Effect.as(true),
    Effect.catchTags({
      NotRunning: () => Effect.succeed(false),
      // Something listens, but no client could be made: still live.
      SingleError: () => Effect.succeed(true),
    }),
    Effect.scoped,
  );

/** `video` as it stands, given whether its worker is `live`. */
export const reconcile = (video: Video, live: boolean): Video =>
  !live && (video.state === 'queued' || video.state === 'running')
    ? { ...video, state: 'stopped' }
    : video;

const lookAt = (video: Video) =>
  video.state === 'queued' || video.state === 'running'
    ? Effect.map(isLive(video.id), (live) => reconcile(video, live))
    : Effect.succeed(video);

/** The Video `id` as it stands. */
export const look = (id: string) => Effect.flatMap(readVideo(id), lookAt);

/** Every Video as it stands, newest first. */
export const lookAll = Effect.flatMap(listVideos, (videos) =>
  Effect.forEach(videos, lookAt, { concurrency: 8 }),
);
