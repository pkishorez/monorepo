import { Schema } from 'effect';
import { useSyncExternalStore } from 'react';
import { Strength } from '../../../video/library/schema.ts';
import { kept, type Place } from './store.ts';

/*
 * What a reload finds as it was left:
 *
 * - Settings  one set for the app: how a finished Video is laid out on a
 *             laptop, whether it is immersive, the strength last picked,
 *             and the player's speed and volume.
 * - Watched   one set per Video: where its short video was, whether the
 *             transcript followed it, which cut's clip was open, and the
 *             row each list was read from.
 * - Draft     a link typed into the create box and not yet made.
 *
 * Which tab is open and which kind of cut is shown live in the URL.
 */

/** How a finished Video sits on a laptop: the transcript `side` by the video, or under a `wide` one. */
export const Layout = Schema.Literals(['side', 'wide']);
export type Layout = typeof Layout.Type;

const Settings = Schema.Struct({
  layout: Schema.optionalKey(Layout),
  immersive: Schema.optionalKey(Schema.Boolean),
  strength: Schema.optionalKey(Strength),
  speed: Schema.optionalKey(Schema.Number),
  volume: Schema.optionalKey(Schema.Number),
  muted: Schema.optionalKey(Schema.Boolean),
});
export type Settings = typeof Settings.Type;

const Watched = Schema.Struct({
  /** Where the short video was, in seconds. */
  time: Schema.optionalKey(Schema.Number),
  following: Schema.optionalKey(Schema.Boolean),
  /** The cut whose clip was open, by its place in the cuts. */
  playing: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  /** The row each list was read from, at the top of what was seen. */
  rows: Schema.optionalKey(
    Schema.Struct({
      transcript: Schema.optionalKey(Schema.Number),
      cuts: Schema.optionalKey(Schema.Number),
    }),
  ),
});
export type Watched = typeof Watched.Type;

/** A video this close to its end, in seconds, starts over next time. */
export const ENDING = 10;
/** Nor is one resumed this close to its start. */
export const STARTING = 5;

/** Where a video `duration` long resumes from what was kept: `null` to start at the top. */
export const resumeAt = (time: number | undefined, duration: number) =>
  time !== undefined &&
  Number.isFinite(time) &&
  Number.isFinite(duration) &&
  time >= STARTING &&
  time < duration - ENDING
    ? time
    : null;

/** A speed the player takes, else `null`. */
export const speedOf = (speed: number | undefined) =>
  speed !== undefined && speed >= 0.25 && speed <= 4 ? speed : null;

/** The app's settings and each Video's, kept in `place`. */
export const keeper = (place?: () => Place | null) => {
  const settings = kept('settings', Settings, place);
  const draft = kept('draft', Schema.String, place);
  const watched = (id: string) => kept(`watched:${id}`, Watched, place);

  let current: Settings | null = null;
  const listeners = new Set<() => void>();
  const read = () => (current ??= settings.read() ?? {});

  return {
    settings: {
      read,
      /** Changes the settings named, keeping the rest. */
      change: (change: Settings) => {
        current = { ...read(), ...change };
        settings.write(current);
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    draft: {
      read: () => draft.read() ?? '',
      write: (url: string) =>
        url.trim() === '' ? draft.clear() : draft.write(url),
    },
    watched: {
      read: (id: string): Watched => watched(id).read() ?? {},
      /** Changes what is kept of `id`, keeping the rest. */
      change: (id: string, change: Watched) => {
        const one = watched(id);
        const was = one.read() ?? {};
        one.write({
          ...was,
          ...change,
          ...(change.rows ? { rows: { ...was.rows, ...change.rows } } : {}),
        });
      },
      /** Forgets where the video was, as at its end. */
      finish: (id: string) => {
        const one = watched(id);
        const { time: _, ...rest } = one.read() ?? {};
        one.write(rest);
      },
    },
  };
};

export const Keep = keeper();

const NONE: Settings = {};

/** The app's settings, drawn again when they change. */
export const useSettings = () =>
  useSyncExternalStore(Keep.settings.subscribe, Keep.settings.read, () => NONE);
