import { type RefObject, useEffect, useRef, useState } from 'react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kestack/web-platform/ui/components/empty';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { PlusIcon } from 'lucide-react';
import { Pages } from '../../../shared/index.ts';
import { ConfirmDelete } from '../parts/index.ts';
import { Create } from './create.tsx';
import { Rows } from './rows.tsx';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Whether `element` has scrolled up under the app bar, out of sight. */
const useGone = (element: HTMLElement | null) => {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (element === null) return;
    const bar =
      document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const seen = new IntersectionObserver(
      ([entry]) => entry && setGone(!entry.isIntersecting),
      { rootMargin: `-${Math.round(bar)}px 0px 0px 0px` },
    );
    seen.observe(element);
    return () => seen.disconnect();
  }, [element]);
  return gone;
};

/**
 * Once the link field has scrolled away, a "+" in the thumb's reach
 * brings the create box back with the field ready to type in. It goes
 * back to the one box rather than opening a copy in a sheet: a sheet with
 * a field in it fights the iOS keyboard, and the list keeps its whole
 * screen.
 */
function New({
  field,
}: {
  readonly field: RefObject<HTMLInputElement | null>;
}) {
  const [element, setElement] = useState<HTMLInputElement | null>(null);
  useEffect(() => setElement(field.current), [field]);
  const gone = useGone(element);
  return (
    <Button
      size="icon"
      aria-label="New short"
      inert={!gone}
      onClick={() => {
        // Focused in the tap itself, so iOS opens the keyboard.
        field.current?.focus({ preventScroll: true });
        scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
      }}
      className={`fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-6 ${gone ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'}`}
    >
      <PlusIcon />
    </Button>
  );
}

/** Rows' shape while the library is first read. */
function Loading() {
  return (
    <ul
      aria-label="Reading the library"
      aria-busy
      className="divide-y divide-border rounded-xl border border-border"
    >
      {[0, 1, 2].map((row) => (
        <li key={row} className="space-y-2 px-4 py-3.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

export const ListView = View.make(Pages.ListLive, ({ root, model, send }) => {
  const { videos } = model;
  const confirming = videos?.find(({ id }) => id === model.confirming);
  const field = useRef<HTMLInputElement>(null);
  return (
    <div {...root} className="mx-auto w-full max-w-4xl space-y-8 sm:space-y-10">
      <Create model={model} send={send} field={field} />
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
          model.unread === null && <Loading />
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
      <New field={field} />
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
