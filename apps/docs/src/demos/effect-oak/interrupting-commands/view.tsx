import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Uploads } from './interrupting-commands.js';
import { UploadRow } from './upload-row/index.js';
import { MILLISECONDS_PER_MEGABYTE } from './uploads.js';

export const UploadsView = View.make(Uploads, ({ model, send, useFrame }) => {
  const anyRunning = model.uploads.some((u) => u.status === 'Uploading');
  return (
    <div className="size-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <div className="flex justify-center gap-2">
          <Button onClick={() => send({ _tag: 'ClickedStartUpload' })}>
            Upload a file
          </Button>
          {anyRunning && (
            <Button
              variant="outline"
              onClick={() => send({ _tag: 'ClickedCancelAllUploads' })}
            >
              Cancel all
            </Button>
          )}
        </div>
        {model.uploads.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nothing here yet. Start an upload.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {model.uploads.map((upload) => (
              <UploadRow
                key={upload.id}
                upload={upload}
                msPerMegabyte={MILLISECONDS_PER_MEGABYTE}
                useFrame={useFrame}
                onCancel={() =>
                  send({ _tag: 'ClickedCancelUpload', uploadId: upload.id })
                }
                onRestart={() =>
                  send({ _tag: 'ClickedRestartUpload', uploadId: upload.id })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});
