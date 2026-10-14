import { useRef, useSyncExternalStore } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ShownContext } from '../page/index.ts';
import type { Known, Shown } from '../page/index.ts';
import type { Metadata, PlaceData } from '../route/index.ts';
import { MetadataWriter, RouterContext } from './context.tsx';
import type { Drawing } from './context.tsx';

/*
 * What the Router draws around the app: the context links and hooks read,
 * a catch for plain clicks on links, and, when an Adapter holds the address,
 * the Metadata. Each Place on screen says what data it shows, so the
 * Metadata follows a page's data as it comes, not only the move.
 */

/** The data each Place on screen shows, by dotted name: a store the Metadata is worked out from. */
const shownStore = () => {
  let data: PlaceData = {};
  const listeners = new Set<() => void>();
  const set = (next: PlaceData) => {
    data = next;
    for (const listener of listeners) listener();
  };
  const store: Shown & {
    readonly subscribe: (listener: () => void) => () => void;
    readonly get: () => PlaceData;
  } = {
    show: (name, value) => {
      if (data[name] !== value) set({ ...data, [name]: value });
    },
    hide: (name) => {
      if (!(name in data)) return;
      const { [name]: _, ...rest } = data;
      set(rest);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => data,
  };
  return store;
};

const EMPTY: PlaceData = {};

/** The data the last move's places started from, then what each Place shows. */
const dataOf = (known: Readonly<Record<string, Known>>, shown: PlaceData) => {
  const data: Record<string, unknown> = {};
  for (const [name, each] of Object.entries(known))
    if (each._tag === 'Ready') data[name] = each.data;
  return { ...data, ...shown };
};

export function Frame({
  drawing,
  known,
  metadataOf,
  attached,
  root,
  onClick,
  children,
}: {
  readonly drawing: Drawing;
  readonly known: Readonly<Record<string, Known>>;
  readonly metadataOf: (data: PlaceData) => Metadata;
  readonly attached: boolean;
  readonly root: object;
  readonly onClick: (event: MouseEvent) => void;
  readonly children: ReactNode;
}) {
  const store = useRef<ReturnType<typeof shownStore>>(undefined);
  store.current ??= shownStore();
  const shown = useSyncExternalStore(
    store.current.subscribe,
    store.current.get,
    () => EMPTY,
  );
  const metadata = metadataOf(dataOf(known, shown));
  return (
    <RouterContext value={{ ...drawing, metadata }}>
      <ShownContext value={store.current}>
        {attached && <MetadataWriter metadata={metadata} />}
        <div {...root} style={{ display: 'contents' }} onClick={onClick}>
          {children}
        </div>
      </ShownContext>
    </RouterContext>
  );
}
