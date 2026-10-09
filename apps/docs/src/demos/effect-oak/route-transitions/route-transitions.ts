import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Location, heardUrl, pushUrl, readPath } from '../location/index.js';
import { Catalog, hangs } from './gallery/index.js';
import { Drafts, Studio } from './studio/index.js';
import { LogEntry, record } from './transition-log/index.js';

/*
 * Work that follows route changes: what starts on entering a page, what
 * happens on staying, and what happens on leaving.
 *
 * Routes are the root's States, heard from the URL as in the routing demo.
 * Each kind of route change maps onto a different part of Effect Oak:
 *
 * - Entering the Gallery creates its Catalog Child, which loads once per
 *   entry in its own Lifetime. Nothing is written for it in Update.
 * - Entering a Painting, or moving to another one, is an Update asking for a
 *   load Command. Moving between paintings stays in the Painting State, and
 *   staying never restarts a Lifetime or Child.
 * - Leaving the Studio is an Update asking for a save Command. There are no
 *   exit actions; Update sees the State it leaves and the one it enters.
 *
 * Every change is logged in the Model, so the log replays with Time Travel.
 */

const PAINTING_MS = 400;
const SAVE_MS = 300;

const Route = Schema.TaggedUnion({
  Opening: {},
  Home: {},
  Gallery: {},
  Painting: { paintingId: Schema.Number, ready: Schema.Boolean },
  Studio: {},
  NotFound: { path: Schema.String },
});
type Route = typeof Route.Type;

const routeFrom = (path: string): Route => {
  const [first, second, ...rest] = readPath(path).segments;
  if (first === undefined) return { _tag: 'Home' };
  if (first === 'studio' && second === undefined) return { _tag: 'Studio' };
  if (first === 'gallery' && second === undefined) return { _tag: 'Gallery' };
  if (first === 'gallery' && rest.length === 0 && /^\d+$/.test(second ?? ''))
    return { _tag: 'Painting', paintingId: Number(second), ready: false };
  return { _tag: 'NotFound', path };
};

const sideOf = (route: Route) => ({
  tag: route._tag,
  label:
    route._tag === 'Painting'
      ? `Painting ${route.paintingId}`
      : route._tag === 'NotFound'
        ? 'Not found'
        : route._tag,
});

const loadPainting = (paintingId: number) =>
  Effect.sleep(PAINTING_MS).pipe(
    Effect.as({ _tag: 'LoadedPainting' as const, paintingId }),
  );

const saveDraft = (text: string) =>
  Effect.sleep(SAVE_MS).pipe(Effect.as({ _tag: 'SavedDraft' as const, text }));

const listen = ({ model }: { readonly model: { readonly path: string } }) =>
  heardUrl(model.path === '' ? null : model.path);

export const RouteTransitions = Node.make('RouteTransitions', {
  requires: { location: Location },
  model: Schema.Struct({
    path: Schema.String,
    log: Schema.Array(LogEntry),
    /** The Studio's text, reported by its editor at every edit. */
    draft: Schema.String,
    saved: Schema.NullOr(Schema.String),
  }),
  state: Route,
  message: Schema.TaggedUnion({
    ChangedUrl: { path: Schema.String },
    ClickedLink: { path: Schema.String },
    LoadedPainting: { paintingId: Schema.Number },
    EditedDraft: { text: Schema.String },
    SavedDraft: { text: Schema.String },
  }),
  provides: { Studio: [Drafts] },
  children: {
    Gallery: { catalog: Catalog },
    Studio: { studio: Studio },
  },
}).build({
  init: () => ({
    model: { path: '', log: [], draft: '', saved: null },
    state: { _tag: 'Opening' },
  }),
  lifetime: {
    Opening: listen,
    Home: listen,
    Gallery: listen,
    Painting: listen,
    Studio: listen,
    NotFound: listen,
  },
  provides: {
    Studio: ({ send }) =>
      Context.make(Drafts, {
        edited: (text) => send({ _tag: 'EditedDraft', text }),
      }),
  },
  update: {
    Painting: {
      LoadedPainting: ({ paintingId }, { state }) =>
        paintingId === state.paintingId
          ? { state: { ...state, ready: true } }
          : {},
    },
    Studio: {
      EditedDraft: ({ text }, { model }) => ({
        model: { ...model, draft: text },
      }),
    },
    '*': {
      ChangedUrl: ({ path }, { model, state }) => {
        const next = routeFrom(path);
        const samePainting =
          state._tag === 'Painting' &&
          next._tag === 'Painting' &&
          state.paintingId === next.paintingId;
        const loads =
          next._tag === 'Painting' && !samePainting && hangs(next.paintingId)
            ? [loadPainting(next.paintingId)]
            : [];
        const leavingStudio = state._tag === 'Studio' && next._tag !== 'Studio';
        const saves =
          leavingStudio && model.draft !== '' ? [saveDraft(model.draft)] : [];
        return {
          model: {
            ...model,
            path,
            draft: leavingStudio ? '' : model.draft,
            log: record(
              model.log,
              state._tag === 'Opening' ? null : sideOf(state),
              sideOf(next),
            ),
          },
          state: samePainting ? state : next,
          commands: [...loads, ...saves],
        };
      },
      ClickedLink: ({ path }) => ({ commands: [pushUrl(path)] }),
      SavedDraft: ({ text }, { model }) => ({
        model: { ...model, saved: text },
      }),
      LoadedPainting: () => ({}),
    },
  },
});

export { HashLocation as RouteTransitionsLive } from '../location/index.js';
