import { Effect, Schema } from 'effect';
import { FILE_KINDS } from '@kestack/connect/files';
import type { Self } from '@kestack/kabuki/core/actor';
import { requestFile } from './commands.ts';

/*
 * The File Tickets a session's page keeps for its File Embeds, as its
 * Model holds them, `files`, by the Message the embed is in, Connection,
 * base folder and path. A browser draws an image it has decoded again
 * for the same URL within a page, whatever the file is now, so a file
 * embedded again in a later Message, as after the agent wrote it again,
 * gets a ticket, and a URL, of its own.
 *
 * 1. Want    an embed that comes into view, or the viewer opened on one,
 *            wants a ticket: asked when there is none, or the one kept is
 *            within five minutes of its end. Its end is this browser's:
 *            an hour after the answer came, never the Connection's clock,
 *            which may be set otherwise. Asking is a Worker of its
 *            own, one per ticket asked, ended by the answer.
 * 2. Answer  a ticket, kept with the URL a browser opens it at; or why
 *            there is none, kept a while and then asked again, as the
 *            file may have come since.
 * 3. Broke   a ticket's URL that failed to load, as after a Plugin
 *            restart ended every ticket, is asked for again once; failing
 *            again, it is said it could not be loaded.
 * 4. View    the embed open in the viewer, if any.
 *
 * Every time it is told comes from the View, `at`, so what a Message makes
 * of the Model is the same each time it is replayed.
 */

/** A ticket within this many ms of its end is asked for again. */
export const RENEW_BEFORE = 5 * 60 * 1000;

/** A refusal is kept this many ms before it is asked again. */
export const REFUSED_FOR = 30 * 1000;

/** What a ticket says of its file, and the URL a browser opens it at. */
export const Ticket = Schema.Struct({
  /** The file, absolute, its symlinks resolved. */
  path: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(FILE_KINDS),
  mime: Schema.String,
  size: Schema.Finite,
  /** Absolute, on the Connection's tunnel. */
  url: Schema.String,
  /**
   * When the ticket ends by this browser's clock, in epoch ms: a ticket's
   * lifetime after its answer came, never the Connection's own time.
   */
  expiresAt: Schema.Finite,
});
export type Ticket = typeof Ticket.Type;

/** One embed's ticket, as kept. `retried`: asked again after its URL failed to load. */
export const Entry = Schema.TaggedUnion({
  Asking: { retried: Schema.Boolean },
  Given: { ticket: Ticket, retried: Schema.Boolean },
  /** Why there is none, as said on hover, and when it was said. */
  Refused: { reason: Schema.String, at: Schema.Finite },
});
export type Entry = typeof Entry.Type;

/** An embed, by the Message it is in and where its path is read from: its Connection, base folder and path. */
export interface Embed {
  /** The Message it is in, by id; empty outside one. */
  readonly message: string;
  readonly connectionId: string;
  readonly base: string;
  readonly path: string;
}

/** The embed open in the viewer, with the caption it was written with. */
export const Viewing = Schema.Struct({
  message: Schema.String,
  connectionId: Schema.String,
  base: Schema.String,
  path: Schema.String,
  caption: Schema.String,
});
export type Viewing = typeof Viewing.Type;

/** What a session's page keeps as `files`. */
export const Kept = Schema.Struct({
  tickets: Schema.Record(Schema.String, Entry),
  viewing: Schema.NullOr(Viewing),
});
export type Kept = typeof Kept.Type;

export const none: Kept = { tickets: {}, viewing: null };

/** The key an embed's ticket is kept by. */
export const keyOf = ({ message, connectionId, base, path }: Embed) =>
  JSON.stringify([message, connectionId, base, path]);

/** The embed a key names. */
export const embedOf = (key: string): Embed => {
  const [message = '', connectionId = '', base = '', path = ''] = JSON.parse(
    key,
  ) as ReadonlyArray<string>;
  return { message, connectionId, base, path };
};

/** Whether a ticket may still be used `at`: until five minutes before its end. */
export const fresh = (ticket: Ticket, at: number) =>
  at < ticket.expiresAt - RENEW_BEFORE;

// 1. Want
/** Whether an embed wanted `at` is asked for: none kept, a ticket near its end, or a refusal kept long enough. */
export const wants = (entry: Entry | undefined, at: number): boolean => {
  if (entry === undefined) return true;
  switch (entry._tag) {
    case 'Asking':
      return false;
    case 'Given':
      return !fresh(entry.ticket, at);
    case 'Refused':
      return at - entry.at >= REFUSED_FOR;
  }
};

/** The entry once wanted `at`: asked for when `wants` says so, else as it was. */
export const wanted = (
  entry: Entry | undefined,
  at: number,
): Entry | undefined =>
  wants(entry, at) ? { _tag: 'Asking', retried: false } : entry;

// 2. Answer
/** The entry once its ask was answered with a ticket; only one being asked takes it. */
export const given = (
  entry: Entry | undefined,
  ticket: Ticket,
): Entry | undefined =>
  entry?._tag === 'Asking'
    ? { _tag: 'Given', ticket, retried: entry.retried }
    : entry;

/** The entry once its ask was refused, `reason` said `at`; only one being asked takes it. */
export const refused = (
  entry: Entry | undefined,
  reason: string,
  at: number,
): Entry | undefined =>
  entry?._tag === 'Asking' ? { _tag: 'Refused', reason, at } : entry;

// 3. Broke
/** Said once a ticket's URL failed to load twice. */
export const NOT_LOADED = 'Could not load it';

/**
 * The entry once its ticket's `url` failed to load `at`: asked again once;
 * failing after that, refused. A URL it no longer keeps changes nothing.
 */
export const broke = (
  entry: Entry | undefined,
  url: string,
  at: number,
): Entry | undefined => {
  if (entry?._tag !== 'Given' || entry.ticket.url !== url) return entry;
  return entry.retried
    ? { _tag: 'Refused', reason: NOT_LOADED, at }
    : { _tag: 'Asking', retried: true };
};

/** The keys being asked for: one Worker each. */
export const asking = ({ tickets }: Kept) =>
  Object.keys(tickets).filter((key) => tickets[key]?._tag === 'Asking');

/*
 * How the session's page keeps them: the Messages it is sent, the Worker
 * that asks, and what each Message makes of its Model's `files`.
 */

const Where = {
  message: Schema.String,
  connectionId: Schema.String,
  base: Schema.String,
  path: Schema.String,
};

/** The Messages the page is sent. */
export const messages = {
  /** An embed came into view, or opened, `at`. */
  FileWanted: { ...Where, at: Schema.Finite },
  FileGiven: { key: Schema.String, ticket: Ticket },
  FileRefused: { key: Schema.String, reason: Schema.String, at: Schema.Finite },
  /** Its ticket's `url` failed to load, `at`. */
  FileBroke: { ...Where, url: Schema.String, at: Schema.Finite },
  /** The viewer opened on an embed, `at`. */
  FileOpened: { ...Where, caption: Schema.String, at: Schema.Finite },
  FileClosed: {},
};

type Holds = { readonly files: Kept };
type Message =
  | ({ readonly _tag: 'FileGiven' } & { key: string; ticket: Ticket })
  | ({ readonly _tag: 'FileRefused' } & {
      key: string;
      reason: string;
      at: number;
    });

/** The Model with one entry changed by `change`. */
const changed = <M extends Holds>(
  model: M,
  key: string,
  change: (entry: Entry | undefined) => Entry | undefined,
) => {
  const was = model.files.tickets[key];
  const now = change(was);
  if (now === was || now === undefined) return model;
  return {
    ...model,
    files: { ...model.files, tickets: { ...model.files.tickets, [key]: now } },
  };
};

/** Each Message's change to the Model: nothing new, none at all. */
const keep = <M extends Holds>(model: M, next: M) =>
  next === model ? {} : { model: next };

export const keeping = {
  workers: {
    // 1. Want: one ask per ticket being asked for.
    asks: {
      each: ({ model }: { readonly model: Holds }) => asking(model.files),
      run: (self: Self<Holds, unknown, Message, unknown>, key: string) =>
        Effect.flatMap(requestFile(embedOf(key)), (answer) =>
          self.send(
            answer._tag === 'Given'
              ? { _tag: 'FileGiven', key, ticket: answer.ticket }
              : {
                  _tag: 'FileRefused',
                  key,
                  reason: answer.reason,
                  at: answer.at,
                },
          ),
        ),
    },
  },
  on: {
    FileWanted: <M extends Holds>(
      { at, ...embed }: Embed & { readonly at: number },
      { model }: { readonly model: M },
    ) =>
      keep(
        model,
        changed(model, keyOf(embed), (entry) => wanted(entry, at)),
      ),
    // 2. Answer
    FileGiven: <M extends Holds>(
      { key, ticket }: { readonly key: string; readonly ticket: Ticket },
      { model }: { readonly model: M },
    ) =>
      keep(
        model,
        changed(model, key, (entry) => given(entry, ticket)),
      ),
    FileRefused: <M extends Holds>(
      {
        key,
        reason,
        at,
      }: { readonly key: string; readonly reason: string; readonly at: number },
      { model }: { readonly model: M },
    ) =>
      keep(
        model,
        changed(model, key, (entry) => refused(entry, reason, at)),
      ),
    // 3. Broke
    FileBroke: <M extends Holds>(
      {
        url,
        at,
        ...embed
      }: Embed & { readonly url: string; readonly at: number },
      { model }: { readonly model: M },
    ) =>
      keep(
        model,
        changed(model, keyOf(embed), (entry) => broke(entry, url, at)),
      ),
    // 4. View: opening one asks again for a ticket near its end.
    FileOpened: <M extends Holds>(
      {
        caption,
        at,
        ...embed
      }: Embed & {
        readonly caption: string;
        readonly at: number;
      },
      { model }: { readonly model: M },
    ) => {
      const next = changed(model, keyOf(embed), (entry) => wanted(entry, at));
      return {
        model: {
          ...next,
          files: {
            ...next.files,
            viewing: {
              message: embed.message,
              connectionId: embed.connectionId,
              base: embed.base,
              path: embed.path,
              caption,
            },
          },
        },
      };
    },
    FileClosed: <M extends Holds>(
      _: unknown,
      { model }: { readonly model: M },
    ) =>
      model.files.viewing === null
        ? {}
        : { model: { ...model, files: { ...model.files, viewing: null } } },
  },
};
