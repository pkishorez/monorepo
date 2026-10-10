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
 * Each upload is a Command that sleeps for its size, started under its own
 * key. Cancelling one cancels that key; cancelling all cancels the key of
 * every upload still running. Either way the Update marks them Cancelled at
 * once: an upload that already finished is not Uploading, so there is
 * nothing to cancel.
 */

const uploadKey = (uploadId: number) => `upload-${uploadId}`;

const uploadFile = (uploadId: number, sizeMegabytes: number) => ({
  key: uploadKey(uploadId),
  run: Effect.sleep(
    Duration.millis(sizeMegabytes * MILLISECONDS_PER_MEGABYTE),
  ).pipe(Effect.as({ _tag: 'SucceededUploadFile' as const, uploadId })),
});

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
        command: uploadFile(upload.id, upload.sizeMegabytes),
      };
    },
    ClickedCancelUpload: ({ uploadId }, { model }) =>
      isUploading(model.uploads, uploadId)
        ? {
            model: {
              ...model,
              uploads: setStatus(model.uploads, uploadId, 'Cancelled'),
            },
            cancel: uploadKey(uploadId),
          }
        : {},
    ClickedCancelAllUploads: (_, { model }) => ({
      model: { ...model, uploads: cancelAll(model.uploads) },
      cancel: model.uploads
        .filter((upload) => upload.status === 'Uploading')
        .map((upload) => uploadKey(upload.id)),
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
        command: uploadFile(uploadId, upload.sizeMegabytes),
      };
    },
    SucceededUploadFile: ({ uploadId }, { model }) => ({
      model: { ...model, uploads: setStatus(model.uploads, uploadId, 'Done') },
    }),
  },
});
