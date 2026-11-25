import { View } from '@kestack/kabuki/react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kestack/web-platform/ui/components/empty';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Pages } from '../../../shared/index.ts';
import { ConfirmDelete } from '../parts/index.ts';
import { Create } from './create.tsx';
import { Rows } from './rows.tsx';

export const ListView = View.make(Pages.ListLive, ({ root, model, send }) => {
  const { videos } = model;
  const confirming = videos?.find(({ id }) => id === model.confirming);
  return (
    <div {...root} className="mx-auto w-full max-w-4xl space-y-10">
      <Create model={model} send={send} />
      <section aria-labelledby="videos" className="space-y-3">
        <h2 id="videos" className="text-sm font-medium text-muted-foreground">
          Videos
        </h2>
        {model.unread !== null && (
          <p role="alert" className="text-sm text-destructive">
            Could not read the library: {model.unread}
          </p>
        )}
        {videos === null ? (
          model.unread === null && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Reading the library…
            </p>
          )
        ) : videos.length === 0 ? (
          <Empty className="border border-border">
            <EmptyHeader>
              <EmptyTitle>No videos yet</EmptyTitle>
              <EmptyDescription>
                Paste a YouTube link above and pick how hard to cut. The short
                video, its transcript and a summary show up here as it works.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Rows model={model} send={send} videos={videos} />
        )}
      </section>
      <ConfirmDelete
        name={confirming ? (confirming.title ?? confirming.id) : null}
        open={confirming !== undefined}
        onCancel={() => send({ _tag: 'Cancel' })}
        onDelete={() =>
          confirming &&
          send({ _tag: 'Act', id: confirming.id, action: 'delete' })
        }
      />
    </div>
  );
});
