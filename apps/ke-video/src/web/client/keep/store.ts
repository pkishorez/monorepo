import { Option, Schema } from 'effect';

/*
 * What the app keeps on this device across a reload: one JSON value per
 * name, under `ke-video:v1:`, read back through its Schema. A value that
 * is missing, damaged or of another shape reads as nothing, and storage
 * that refuses, as in a private window or on a full disk, keeps nothing:
 * neither ever breaks a page.
 */

const PREFIX = 'ke-video:v1:';

/** Where values are kept: the device's `localStorage`, or a stand-in. */
export type Place = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const device = (): Place | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export interface Kept<A> {
  /** The value kept, or `null` when there is none that reads. */
  readonly read: () => A | null;
  readonly write: (value: A) => void;
  readonly clear: () => void;
}

/** The value kept under `name`, read and written as `schema` says. */
export const kept = <A, I>(
  name: string,
  schema: Schema.Codec<A, I>,
  place: () => Place | null = device,
): Kept<A> => {
  const key = PREFIX + name;
  const json = Schema.fromJsonString(schema) as unknown as Schema.Codec<
    A,
    string
  >;
  const decode = Schema.decodeUnknownOption(json);
  const encode = Schema.encodeUnknownOption(json);
  return {
    read: () => {
      try {
        const raw = place()?.getItem(key);
        return raw == null ? null : Option.getOrNull(decode(raw));
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        const raw = encode(value);
        if (Option.isSome(raw)) place()?.setItem(key, raw.value);
      } catch {
        // Full or refused: kept for this page only.
      }
    },
    clear: () => {
      try {
        place()?.removeItem(key);
      } catch {
        // Refused: nothing was kept.
      }
    },
  };
};

/**
 * `run` at most once every `ms`: a call in between is held and run when
 * the time is up, with the latest arguments; `flush` runs a held one now.
 */
export const throttled = <Args extends ReadonlyArray<unknown>>(
  run: (...args: Args) => void,
  ms: number,
  now: () => number = Date.now,
) => {
  let last = -Infinity;
  let held: Args | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = undefined;
    if (held === null) return;
    const args = held;
    held = null;
    last = now();
    run(...args);
  };
  return {
    call: (...args: Args) => {
      held = args;
      const wait = last + ms - now();
      if (wait <= 0) fire();
      else timer ??= setTimeout(fire, wait);
    },
    flush: fire,
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
      held = null;
    },
  };
};
