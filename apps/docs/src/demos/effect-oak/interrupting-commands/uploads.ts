import { Schema } from 'effect';

/*
 * The uploads as data: their Schema, the fake files they cycle through, and
 * what each change does to the list.
 */

export const UploadStatus = Schema.Literals(['Uploading', 'Done', 'Cancelled']);
export type UploadStatus = typeof UploadStatus.Type;

export const Upload = Schema.Struct({
  id: Schema.Number,
  fileName: Schema.String,
  sizeMegabytes: Schema.Number,
  status: UploadStatus,
  /** The Time this run of the upload started, for its progress bar. */
  startedAt: Schema.Number,
});
export type Upload = typeof Upload.Type;

export const UploadList = Schema.Array(Upload);
export type UploadList = typeof UploadList.Type;

const FAKE_FILES = [
  { name: 'vacation-photos.zip', sizeMegabytes: 48 },
  { name: 'demo-recording.mp4', sizeMegabytes: 87 },
  { name: 'quarterly-report.pdf', sizeMegabytes: 12 },
  { name: 'design-assets.sketch', sizeMegabytes: 34 },
  { name: 'database-backup.sql', sizeMegabytes: 61 },
] as const;

export const MILLISECONDS_PER_MEGABYTE = 100;

export const fakeFile = (id: number) => FAKE_FILES[id % FAKE_FILES.length]!;

export const setStatus = (
  uploads: UploadList,
  id: number,
  status: UploadStatus,
  startedAt?: number,
): UploadList =>
  uploads.map((upload) =>
    upload.id === id
      ? { ...upload, status, startedAt: startedAt ?? upload.startedAt }
      : upload,
  );

export const cancelAll = (uploads: UploadList): UploadList =>
  uploads.map((upload) =>
    upload.status === 'Uploading' ? { ...upload, status: 'Cancelled' } : upload,
  );
