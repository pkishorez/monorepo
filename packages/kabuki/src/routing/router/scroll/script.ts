import { STORAGE } from './session.ts';

/*
 * The script a server writes at the end of the page, run before the app
 * hydrates, as TanStack Start's is: it puts the window and every scrolled
 * element back where the entry left them, so a reload never paints at the
 * top first. With nothing saved, it goes to the hash's element, or the top.
 * It runs as a string in the page, so it uses nothing from outside itself.
 */

function restore(storage: string, state: string, key?: string) {
  let byKey: Record<
    string,
    Record<string, { scrollX: number; scrollY: number }>
  >;
  try {
    byKey = JSON.parse(sessionStorage.getItem(storage) || '{}');
  } catch {
    return;
  }
  const entries =
    byKey?.[
      key || (history.state as Record<string, string> | null)?.[state] || ''
    ];
  let windowRestored = false;
  for (const selector in entries) {
    const { scrollX, scrollY } = entries[selector] ?? {};
    if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY)) continue;
    if (selector === 'window') {
      scrollTo(scrollX!, scrollY!);
      windowRestored = true;
    } else {
      try {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollLeft = scrollX!;
          element.scrollTop = scrollY!;
        }
      } catch {}
    }
  }
  if (windowRestored) return;
  const hash = location.hash.slice(1);
  if (hash) {
    document.getElementById(decodeURIComponent(hash))?.scrollIntoView();
    return;
  }
  scrollTo(0, 0);
}

const safe = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The inline script for a page: it reads the key the Router stamped on the
 * history entry, under `state`, unless `key` names another.
 */
export const scriptFor = (state: string, key?: string) =>
  `(${restore.toString()})(${safe(STORAGE)},${safe(state)}${key === undefined ? '' : `,${safe(key)}`})`;
