import { Duration, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Uploader } from './uploader/index.js';
import {
  cancelAll,
  fakeFile,
  MILLISECONDS_PER_MEGABYTE,
  setStatus,
  UploadList,
} from './uploads.js';

/*
 * Fake file uploads that can be cancelled one at a time, or all at once.
 *
 * Each upload is a Command that sleeps for its size. Cancelling one asks the
 * Uploader Service to stop that upload's work, and its answer comes back as
 * a Message, as in Foldkit: Interrupted, or NotFound if it had already
 * finished. Cancelling all is Effect Oak's own `replaceCommands`: an Update
 * with no Commands that replaces every running one.
 */

const uploadFile = (uploadId: number, sizeMegabytes: number) =>
  Effect.gen(function* () {
    yield* (yield* Uploader).run(
      uploadId,
      Effect.sleep(Duration.millis(sizeMegabytes * MILLISECONDS_PER_MEGABYTE)),
    );
    return { _tag: 'SucceededUploadFile' as const, uploadId };
  });

const cancelUploadFile = (uploadId: number) =>
  Effect.gen(function* () {
    const outcome = yield* (yield* Uploader).cancel(uploadId);
    return { _tag: 'CompletedCancelUploadFile' as const, uploadId, outcome };
  });

export const Uploads = Node.make('Uploads', {
  requires: { uploader: Uploader },
  model: Schema.Struct({ nextId: Schema.Number, uploads: UploadList }),
  message: Schema.TaggedUnion({
    ClickedStartUpload: {},
    ClickedCancelUpload: { uploadId: Schema.Number },
    ClickedCancelAllUploads: {},
    ClickedRestartUpload: { uploadId: Schema.Number },
    SucceededUploadFile: { uploadId: Schema.Number },
    CompletedCancelUploadFile: {
      uploadId: Schema.Number,
      outcome: Schema.Literals(['Interrupted', 'NotFound']),
    },
  }),
}).build({
  init: () => ({ model: { nextId: 0, uploads: [] } }),
  update: {
    ClickedStartUpload: (_, { model, at }) => {
      const file = fakeFile(model.nextId);
      const upload = {
        id: model.nextId,
        fileName: file.name,
        sizeMegabytes: file.sizeMegabytes,
        status: 'Uploading' as const,
        startedAt: at,
      };
      return {
        model: {
          nextId: model.nextId + 1,
          uploads: [...model.uploads, upload],
        },
        commands: [uploadFile(upload.id, upload.sizeMegabytes)],
      };
    },
    ClickedCancelUpload: ({ uploadId }) => ({
      commands: [cancelUploadFile(uploadId)],
    }),
    ClickedCancelAllUploads: (_, { model }) => ({
      model: { ...model, uploads: cancelAll(model.uploads) },
      commands: [],
      replaceCommands: true,
    }),
    ClickedRestartUpload: ({ uploadId }, { model, at }) => {
      const upload = model.uploads.find(
        (each) => each.id === uploadId && each.status === 'Cancelled',
      );
      if (!upload) return {};
      return {
        model: {
          ...model,
          uploads: setStatus(model.uploads, uploadId, 'Uploading', at),
        },
        commands: [uploadFile(uploadId, upload.sizeMegabytes)],
      };
    },
    SucceededUploadFile: ({ uploadId }, { model }) => ({
      model: { ...model, uploads: setStatus(model.uploads, uploadId, 'Done') },
    }),
    CompletedCancelUploadFile: ({ uploadId, outcome }, { model }) =>
      outcome === 'Interrupted'
        ? {
            model: {
              ...model,
              uploads: setStatus(model.uploads, uploadId, 'Cancelled'),
            },
          }
        : {},
  },
});

export { UploaderLive } from './uploader/index.js';
