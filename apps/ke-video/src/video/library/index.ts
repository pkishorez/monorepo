/*
 * The library: every Video ke-video knows, on disk. Each has a folder of
 * its own under the library root, named by its YouTube id, holding its
 * record, its log of Events and the files its steps make. `schema.ts`
 * fixes their shapes, `link.ts` reads an id from a link, `disk.ts` reads and
 * writes the files, and `live.ts` tells whether a Video's worker is live.
 */
export * from './schema.ts';
export { idOf } from './link.ts';
export {
  appendEvent,
  DiskError,
  exists,
  filesOf,
  listVideos,
  modelFolder,
  NotFound,
  readEvents,
  readEventsFrom,
  readVideo,
  removeVideo,
  root,
  workOf,
  writeVideo,
} from './disk.ts';
export {
  Busy,
  busySocket,
  isLive,
  look,
  lookAll,
  reconcile,
  WorkerControl,
  workerSocket,
} from './live.ts';
