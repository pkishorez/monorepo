import { Duration, Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
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
 * Each upload is a Worker on its row's status: one runs for every upload
 * whose status is Uploading, sleeps for its size, and ends by sending
 * SucceededUploadFile, whose Update sets the status to Done. Cancelling is
 * the Update setting the status to Cancelled: the row leaves the Condition
 * and its Worker stops. There is no cancel verb. An upload that already
 * finished is not Uploading, so there is nothing to stop.
 */

const isUploading = (uploads: UploadList, uploadId: number) =>
  uploads.some((each) => each.id === uploadId && each.status === 'Uploading');

export const Uploads = Actor.make('Uploads', {
  model: Schema.Struct({ nextId: Schema.Number, uploads: UploadList }),
  message: Schema.TaggedUnion({
    ClickedStartUpload: {},
    ClickedCancelUpload: { uploadId: Schema.Number },
    ClickedCancelAllUploads: {},
    ClickedRestartUpload: { uploadId: Schema.Number },
    SucceededUploadFile: { uploadId: Schema.Number },
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
      };
    },
    ClickedCancelUpload: ({ uploadId }, { model }) =>
      isUploading(model.uploads, uploadId)
        ? {
            model: {
              ...model,
              uploads: setStatus(model.uploads, uploadId, 'Cancelled'),
            },
          }
        : {},
    ClickedCancelAllUploads: (_, { model }) => ({
      model: { ...model, uploads: cancelAll(model.uploads) },
    }),
    ClickedRestartUpload: ({ uploadId }, { model, at }) =>
      model.uploads.some(
        (each) => each.id === uploadId && each.status === 'Cancelled',
      )
        ? {
            model: {
              ...model,
              uploads: setStatus(model.uploads, uploadId, 'Uploading', at),
            },
          }
        : {},
    SucceededUploadFile: ({ uploadId }, { model }) => ({
      model: { ...model, uploads: setStatus(model.uploads, uploadId, 'Done') },
    }),
  },
  workers: {
    // One per upload still Uploading; it sleeps until the file's end, then is done.
    upload: {
      each: ({ model }) =>
        model.uploads
          .filter((upload) => upload.status === 'Uploading')
          .map((upload) => String(upload.id)),
      run: (self, key) =>
        Effect.gen(function* () {
          const uploadId = Number(key);
          const { model } = yield* self.get;
          const upload = model.uploads.find((each) => each.id === uploadId);
          if (!upload) return;
          const endsAt =
            upload.startedAt + upload.sizeMegabytes * MILLISECONDS_PER_MEGABYTE;
          yield* Effect.sleep(Duration.millis(endsAt - (yield* self.now)));
          yield* self.send({ _tag: 'SucceededUploadFile', uploadId });
        }),
    },
  },
});
