import { Effect, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  CutKind,
  Event,
  Video as VideoRecord,
} from '../../../video/library/schema.ts';
import { Api, Outputs } from '../api/index.ts';

/*
 * One Video. Its record is read once, then every 2 s while it is queued or
 * running. Until it is done its log streams in: the stream runs again,
 * from the first Event, each time the Video starts or stops working, so
 * one that is resumed picks up live. Once done, its transcript, summary
 * and cuts are read once, and the page shows which panel is open, which
 * kind of cut the list shows, and which cut of the original is playing.
 * After a delete it goes back to the list.
 */

const Panel = Schema.Literals(['transcript', 'summary', 'cuts']);
const Filter = Schema.Union([CutKind, Schema.Literal('all')]);
export type Filter = typeof Filter.Type;

const working = (video: VideoRecord | null) =>
  video !== null && (video.state === 'queued' || video.state === 'running');

const act = Command.make('act', {
  args: Schema.Struct({
    id: Schema.String,
    action: Schema.Literals(['stop', 'resume']),
  }),
  run: ({ id, action }) =>
    Effect.flatMap(Api, (api) => api[action](id)).pipe(
      Effect.match({
        onSuccess: (video) => ({ _tag: 'Acted' as const, video }),
        onFailure: ({ message }) => ({
          _tag: 'Refused' as const,
          error: message,
        }),
      }),
    ),
});

const remove = Command.make('remove', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(Api, (api) => api.remove(id)).pipe(
      Effect.match({
        onSuccess: () => ({ _tag: 'Removed' as const }),
        onFailure: ({ message }) => ({
          _tag: 'Refused' as const,
          error: message,
        }),
      }),
    ),
});

export const Video = Page.define({
  path: '/videos/:id',
  params: { id: Schema.String },
  render: 'client',
  requires: [Api],
  metadata: ({ id }) => ({ title: `${id} · ke-video` }),
  model: {
    /** `null` until the first answer. */
    video: Schema.NullOr(VideoRecord),
    /** Why the last read of the record failed, until one succeeds. */
    unread: Schema.NullOr(Schema.String),
    events: Schema.Array(Event),
    /** A finished Video's transcript, summary and cuts, once read. */
    outputs: Schema.NullOr(Outputs),
    unloaded: Schema.NullOr(Schema.String),
    busy: Schema.Boolean,
    refused: Schema.NullOr(Schema.String),
    confirming: Schema.Boolean,
    panel: Panel,
    filter: Filter,
    /** The cut whose part of the original plays, by its place in `cuts.removed`. */
    playing: Schema.NullOr(Schema.Number),
  },
  message: {
    Read: { video: VideoRecord },
    Unread: { error: Schema.String },
    Logged: { events: Schema.Array(Event), fresh: Schema.Boolean },
    Loaded: { outputs: Outputs },
    Unloaded: { error: Schema.String },
    Act: { action: Schema.Literals(['stop', 'resume']) },
    Acted: { video: VideoRecord },
    Refused: { error: Schema.String },
    Confirm: {},
    Cancel: {},
    Delete: {},
    Removed: {},
    Show: { panel: Panel },
    Pick: { filter: Filter },
    Play: { cut: Schema.NullOr(Schema.Number) },
  },
});

export const VideoLive = Video.build({
  init: () => ({
    model: {
      video: null,
      unread: null,
      events: [],
      outputs: null,
      unloaded: null,
      busy: false,
      refused: null,
      confirming: false,
      panel: 'transcript',
      filter: 'all',
      playing: null,
    },
  }),
  workers: {
    status: {
      while: ({ model }) => model.video === null || working(model.video),
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          let last = '';
          while (true) {
            const read = yield* Effect.result(api.status(props.params.id));
            const message =
              read._tag === 'Success'
                ? { _tag: 'Read' as const, video: read.success }
                : { _tag: 'Unread' as const, error: read.failure.message };
            const seen = JSON.stringify(message);
            if (seen !== last) yield* self.send(message);
            last = seen;
            yield* Effect.sleep('2 seconds');
          }
        }),
    },
    log: {
      // One stream while it works, another once it has stopped: each
      // starts from the first Event.
      each: ({ model }) =>
        model.video === null || model.video.state === 'done'
          ? []
          : [working(model.video) ? 'working' : 'still'],
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          let fresh = true;
          yield* api.logs(props.params.id).pipe(
            Stream.groupedWithin(500, '100 millis'),
            Stream.runForEach((events) => {
              const message = { _tag: 'Logged' as const, events, fresh };
              fresh = false;
              return self.send(message);
            }),
            Effect.catch(({ message }) =>
              self.send({ _tag: 'Unread', error: message }),
            ),
          );
        }),
    },
    outputs: {
      while: ({ model }) =>
        model.video?.state === 'done' &&
        model.outputs === null &&
        model.unloaded === null,
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          const read = yield* Effect.result(api.outputs(props.params.id));
          yield* self.send(
            read._tag === 'Success'
              ? { _tag: 'Loaded', outputs: read.success }
              : { _tag: 'Unloaded', error: read.failure.message },
          );
        }),
    },
  },
  on: {
    Read: ({ video }) => ({ model: { video, unread: null } }),
    Unread: ({ error }) => ({ model: { unread: error } }),
    Logged: ({ events, fresh }, { model }) => ({
      model: { events: fresh ? events : [...model.events, ...events] },
    }),
    Loaded: ({ outputs }) => ({ model: { outputs } }),
    Unloaded: ({ error }) => ({ model: { unloaded: error } }),
    Act: ({ action }, { model, props }) =>
      model.busy
        ? {}
        : {
            model: { busy: true, refused: null },
            command: act({ id: props.params.id, action }),
          },
    Acted: ({ video }) => ({ model: { video, busy: false } }),
    Refused: ({ error }) => ({ model: { refused: error, busy: false } }),
    Confirm: () => ({ model: { confirming: true, refused: null } }),
    Cancel: () => ({ model: { confirming: false } }),
    Delete: (_, { model, props }) =>
      model.busy
        ? {}
        : {
            model: { busy: true, confirming: false, refused: null },
            command: remove({ id: props.params.id }),
          },
    Removed: () => ({
      model: { busy: false },
      command: Router.replace({ _tag: 'List' }),
    }),
    Show: ({ panel }) => ({ model: { panel } }),
    Pick: ({ filter }) => ({ model: { filter, playing: null } }),
    Play: ({ cut }) => ({ model: { playing: cut } }),
  },
});
