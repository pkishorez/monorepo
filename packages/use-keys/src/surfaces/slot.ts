import type { Ref, RefCallback } from 'react';

type Props = Record<string, unknown>;

const HANDLER = /^on[A-Z]/;

/**
 * Props for the single child a Surface is drawn on: the child's own win,
 * but event handlers run both, the child's first, class names join and
 * styles merge.
 */
export const mergeProps = (slot: Props, child: Props): Props => {
  const merged: Props = { ...slot, ...child };
  for (const [name, mine] of Object.entries(slot)) {
    const theirs = child[name];
    if (theirs === undefined) continue;
    if (HANDLER.test(name) && typeof mine === 'function') {
      merged[name] = (...args: unknown[]) => {
        (theirs as (...args: unknown[]) => unknown)(...args);
        (mine as (...args: unknown[]) => unknown)(...args);
      };
    } else if (name === 'className') {
      merged[name] = [mine, theirs].filter(Boolean).join(' ');
    } else if (name === 'style') {
      merged[name] = { ...(mine as object), ...(theirs as object) };
    }
  }
  return merged;
};

const set = <T>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') return ref(value);
  if (ref !== null && ref !== undefined) ref.current = value;
  return undefined;
};

/** One ref that sets every one of `refs`, and cleans each up. */
export const composeRefs =
  <T>(...refs: ReadonlyArray<Ref<T> | undefined>): RefCallback<T> =>
  (value) => {
    const cleanups = refs.map((ref) => set(ref, value));
    return () => {
      cleanups.forEach((cleanup, index) => {
        if (typeof cleanup === 'function') cleanup();
        else set(refs[index], null);
      });
    };
  };
