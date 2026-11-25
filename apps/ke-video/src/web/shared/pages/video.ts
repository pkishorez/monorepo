import { Effect, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  CutKind,
  Event,
  Range,
  Video as VideoRecord,
} from '../../../video/library/schema.ts';
import { Api, Outputs } from '../api/index.ts';

/*
 * One Video. Its record is read once, then every 2 s while it is queued or
 * running. Until it is done its log streams in: the stream runs again,
 * from the first Event, each time the Video starts or stops working, so
 * one that is resumed picks up live. Once done, its transcript, summary
 * and cuts are read once, and the page shows which panel is open, which
 * kind of cut the list shows, and which cut is playing: its clip is made
 * when it is asked for, which can take a few seconds. The panel and the
 * kind are in the URL (`?tab=cuts&kind=fillers`), replaced as they
 * change, so a reload or a link opens the same view; one the page does
 * not know reads as the first.
 * After a delete it goes back to the list.
 */

const Panel = Schema.Literals(['transcript', 'summary', 'cuts']);
type Panel = typeof Panel.Type;
const Filter = Schema.Union([CutKind, Schema.Literal('all')]);
export type Filter = typeof Filter.Type;

const panelOf = (tab: string | undefined): Panel =>
  Schema.is(Panel)(tab) ? tab : 'transcript';
const filterOf = (kind: string | undefined): Filter =>
  Schema.is(Filter)(kind) ? kind : 'all';

/** The URL of the view: the defaults are left out. */
const at = (id: string, panel: Panel, filter: Filter) => {
  const route: { readonly _tag: 'Video'; readonly id: string } = {
    _tag: 'Video',
    id,
    ...(panel === 'transcript' ? {} : { tab: panel }),
    ...(filter === 'all' ? {} : { kind: filter }),
  };
  return Router.replace(route, { resetScroll: false });
};

/** The clip of the cut playing: made, with the seconds of it removed, or why not. */
const Clip = Schema.Struct({
  cut: Schema.Number,
  removed: Schema.NullOr(Schema.Array(Range)),
  error: Schema.NullOr(Schema.String),
});

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
  // Read as text, so an unknown tab or kind opens the page, not Not found.
  query: {
    tab: Schema.optionalKey(Schema.String),
    kind: Schema.optionalKey(Schema.String),
  },
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
    /** Its clip, `null` while it is being made. */
    clip: Schema.NullOr(Clip),
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
    /** The URL's tab and kind, as the page is first drawn. */
    Opened: {
      tab: Schema.optionalKey(Schema.String),
      kind: Schema.optionalKey(Schema.String),
    },
    Show: { panel: Panel },
    Pick: { filter: Filter },
    Play: { cut: Schema.NullOr(Schema.Number) },
    Clipped: { clip: Clip },
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
      clip: null,
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
    clip: {
      each: ({ model }) =>
        model.playing === null ? [] : [String(model.playing)],
      run: (self, key) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          const cut = Number(key);
          const made = yield* Effect.result(api.clip(props.params.id, cut));
          yield* self.send({
            _tag: 'Clipped',
            clip:
              made._tag === 'Success'
                ? { cut, removed: made.success, error: null }
                : { cut, removed: null, error: made.failure.message },
          });
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
    Opened: ({ tab, kind }) => ({
      model: { panel: panelOf(tab), filter: filterOf(kind) },
    }),
    Show: ({ panel }, { model, props }) =>
      panel === model.panel
        ? {}
        : {
            model: { panel },
            command: at(props.params.id, panel, model.filter),
          },
    Pick: ({ filter }, { model, props }) => ({
      model: { filter, playing: null, clip: null },
      ...(filter === model.filter
        ? {}
        : { command: at(props.params.id, model.panel, filter) }),
    }),
    Play: ({ cut }) => ({ model: { playing: cut, clip: null } }),
    Clipped: ({ clip }, { model }) =>
      clip.cut === model.playing ? { model: { clip } } : {},
  },
});
