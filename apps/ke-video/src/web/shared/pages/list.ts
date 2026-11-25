import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { Strength, Video } from '../../../video/library/schema.ts';
import { Api } from '../api/index.ts';

/*
 * Every Video, newest first, read again every 2 s, and the box that makes
 * a new one from a YouTube link. Each row can be stopped, resumed or
 * deleted as its state allows; a delete asks first. A refusal is the
 * CLI's own line, shown until the next ask.
 */

const Action = Schema.Literals(['stop', 'resume', 'delete']);
type Action = typeof Action.Type;

const create = Command.make('create', {
  args: Schema.Struct({ url: Schema.String, strength: Strength }),
  run: ({ url, strength }) =>
    Effect.flatMap(Api, (api) => api.create(url, strength)).pipe(
      Effect.match({
        onSuccess: (video) => ({ _tag: 'Created' as const, video }),
        onFailure: ({ message }) => ({
          _tag: 'Refused' as const,
          id: null,
          error: message,
        }),
      }),
    ),
});

const act = Command.make('act', {
  args: Schema.Struct({ id: Schema.String, action: Action }),
  run: ({ id, action }) =>
    Effect.flatMap(Api, (api) =>
      action === 'delete' ? Effect.as(api.remove(id), null) : api[action](id),
    ).pipe(
      Effect.match({
        onSuccess: (video) => ({ _tag: 'Acted' as const, id, video }),
        onFailure: ({ message }) => ({
          _tag: 'Refused' as const,
          id,
          error: message,
        }),
      }),
    ),
});

export const List = Page.define({
  path: '/',
  render: 'client',
  requires: [Api],
  metadata: { title: 'ke-video' },
  model: {
    /** `null` until the first answer. */
    videos: Schema.NullOr(Schema.Array(Video)),
    /** Why the last read of the list failed, until one succeeds. */
    unread: Schema.NullOr(Schema.String),
    url: Schema.String,
    strength: Strength,
    creating: Schema.Boolean,
    /** The last refusal, and the Video it was about, `null` for create. */
    refused: Schema.NullOr(
      Schema.Struct({ id: Schema.NullOr(Schema.String), error: Schema.String }),
    ),
    /** Videos with a command under way. */
    busy: Schema.Array(Schema.String),
    /** The Video whose delete is being asked about. */
    confirming: Schema.NullOr(Schema.String),
  },
  message: {
    Listed: { videos: Schema.Array(Video) },
    Unread: { error: Schema.String },
    Typed: { url: Schema.String },
    Picked: { strength: Strength },
    Create: {},
    Created: { video: Video },
    Refused: { id: Schema.NullOr(Schema.String), error: Schema.String },
    Act: { id: Schema.String, action: Action },
    Acted: { id: Schema.String, video: Schema.NullOr(Video) },
    Confirm: { id: Schema.String },
    Cancel: {},
  },
});

const without = (list: ReadonlyArray<string>, id: string) =>
  list.filter((each) => each !== id);

export const ListLive = List.build({
  init: () => ({
    model: {
      videos: null,
      unread: null,
      url: '',
      strength: 'normal',
      creating: false,
      refused: null,
      busy: [],
      confirming: null,
    },
  }),
  workers: {
    poll: {
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          let last = '';
          while (true) {
            const read = yield* Effect.result(api.list);
            const message =
              read._tag === 'Success'
                ? { _tag: 'Listed' as const, videos: read.success }
                : { _tag: 'Unread' as const, error: read.failure.message };
            const seen = JSON.stringify(message);
            if (seen !== last) yield* self.send(message);
            last = seen;
            yield* Effect.sleep('2 seconds');
          }
        }),
    },
  },
  on: {
    Listed: ({ videos }) => ({ model: { videos, unread: null } }),
    Unread: ({ error }) => ({ model: { unread: error } }),
    Typed: ({ url }) => ({ model: { url } }),
    Picked: ({ strength }) => ({ model: { strength } }),
    Create: (_, { model }) =>
      model.creating || model.url.trim() === ''
        ? {}
        : {
            model: { creating: true, refused: null },
            command: create({
              url: model.url.trim(),
              strength: model.strength,
            }),
          },
    Created: ({ video }, { model }) => ({
      model: {
        creating: false,
        url: '',
        videos: [
          video,
          ...(model.videos ?? []).filter((each) => each.id !== video.id),
        ],
      },
    }),
    Refused: ({ id, error }, { model }) => ({
      model: {
        refused: { id, error },
        ...(id === null
          ? { creating: false }
          : { busy: without(model.busy, id) }),
      },
    }),
    Act: ({ id, action }, { model }) =>
      model.busy.includes(id)
        ? {}
        : {
            model: {
              busy: [...model.busy, id],
              refused: null,
              confirming: null,
            },
            command: act({ id, action }),
          },
    Acted: ({ id, video }, { model }) => ({
      model: {
        busy: without(model.busy, id),
        videos: (model.videos ?? []).flatMap((each) =>
          each.id !== id ? [each] : video === null ? [] : [video],
        ),
      },
    }),
    Confirm: ({ id }) => ({ model: { confirming: id, refused: null } }),
    Cancel: () => ({ model: { confirming: null } }),
  },
});

export type { Action };
