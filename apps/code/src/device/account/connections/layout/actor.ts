import { Effect, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Preferences, PreferencesRead } from '../../../store.ts';
import { home, project, session, settings } from '../../../routes/index.ts';
import { ProjectRow, SessionRow } from '../connection/records/index.ts';
import { Pickers } from './pickers/index.ts';
import { Sidebar } from './sidebar/index.ts';

/*
 * Layout: what is drawn around every page while an Account is known, with
 * the keys over all of it. It starts over for each Account drawn.
 *
 * 1. Keys      the keyboard of Preferences, the user's Bindings and
 *              whether Vim Mode is on, whether the app floats as a window,
 *              and the text size, is handed in as it starts, read by the
 *              root page before it draws, so Layout draws at once; then
 *              followed as it changes, and nothing else of Preferences.
 *              Vim Mode turned on or off shows at once and is kept; the
 *              window and the text size are chosen in Settings.
 * 2. Children  the sidebar (`sidebar/`), which keeps its own width and the
 *              Account's Connection Filter; the Pickers the keys open anywhere
 *              (`pickers/`), handed the Bindings; and,
 *              for the header its View draws, the rows of
 *              the project and the session the URL names, nothing else, so
 *              a change to any other draws nothing there. The session's
 *              agent and model are the Draft's to say.
 * 3. Go        starts a new session in the project open, opens Settings,
 *              remembering where it was opened from, so the same key goes
 *              back there, and goes Back and Forward through the pages.
 * 4. Shown     nothing of it is drawn, the root page's mark staying, until
 *              what it first draws is read from this device: the sidebar's
 *              rows, the header's, and the page's (`view.tsx`). Then it is
 *              drawn whole, in one step, and stays drawn. What the
 *              Connections answer after comes in behind, never waited for.
 */

// 4. Shown
/** A header's row as its Query reads it: the id it asks for, and the row's it holds. */
export interface RowRead {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly asked: string;
  readonly held: string | undefined;
}

/**
 * Whether a header's row is read for `wanted`, the id the URL names: none
 * named, or its Query asks for that id, is not loading, and holds no
 * other row, as it may for a moment after the URL moved.
 */
export const rowRead = (wanted: string | null, row: RowRead | undefined) =>
  wanted === null ||
  (row !== undefined &&
    row.asked === wanted &&
    row.status !== 'loading' &&
    (row.held === undefined || row.held === wanted));

/** Keeps Vim Mode on or off in Preferences; a write that fails is lost. */
const setVim = Command.make('SetVim', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(Preferences, (store) => store.setVim(on)).pipe(
      Effect.ignore,
    ),
});

/** The project open, and the session open in it, if any: the Draft open. */
const Place = Schema.NullOr(
  Schema.Struct({
    connectionId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
);

/** Where Settings were opened from: a project, a session in it, or home. */
const Back = Place;

/**
 * The keyboard as this browser keeps it, the Bindings and Vim Mode, and
 * the screen around it: whether the app floats as a window, and the text
 * size.
 */
export const Keys = Schema.Struct({
  bindings: PreferencesRead.fields.bindings,
  vim: Schema.Boolean,
  floating: Schema.Boolean,
  textSize: PreferencesRead.fields.textSize,
});
const sameKeys = Schema.toEquivalence(Keys);

/** The keyboard and the screen of Preferences as read. */
export const keysOf = ({
  bindings,
  vim,
  floating,
  textSize,
}: PreferencesRead): typeof Keys.Type => ({
  bindings,
  vim,
  floating,
  textSize,
});

const Layout = Actor.define('Layout', {
  requires: [Navigation, Preferences],
  /** The keyboard as the root page last read it. */
  input: Schema.Struct({ keyboard: Keys }),
  props: Schema.Struct({
    /** The Account drawn, signed in or last active while it is checked. */
    accountId: Schema.String,
    email: Schema.String,
    place: Place,
  }),
  model: Schema.Struct({
    /** Where Settings were opened from, while they are open. */
    back: Back,
    /** The keyboard, as last read, or as Vim Mode was just turned. */
    keyboard: Keys,
    /** Whether it is drawn: once all it first draws was read (4. Shown). */
    shown: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    KeyboardRead: { keyboard: Keys },
    /** Vim Mode turned on or off, by its keys or in Settings. */
    VimChanged: { on: Schema.Boolean },
    /** A new session in the project open. */
    NewSessionAsked: { connectionId: Schema.String, projectId: Schema.String },
    /** Settings, from where the app is; `back`: back from Settings. */
    SettingsToggled: { from: Back, back: Schema.Boolean },
    /** Ctrl+O and Ctrl+I: Back and Forward through the pages. */
    BackAsked: {},
    ForwardAsked: {},
    /** All it first draws is read from this device: the sidebar, the header and the page. */
    Ready: {},
  }),
});

/** The keyboard, now and after each change to it, here or in another tab. */
export const keyboard = Stream.concat(
  Stream.make(undefined),
  Preferences.changes,
).pipe(
  Stream.mapEffect(() => Effect.map(Preferences.read, keysOf)),
  Stream.changesWith(sameKeys),
);

export const LayoutLive = Actor.build(Layout, {
  init: ({ keyboard }) => ({
    model: { back: null, keyboard, shown: false },
  }),
  // 2. Children
  children: {
    sidebar: {
      actor: Sidebar.actor,
      props: ({ props }) => ({ accountId: props.accountId }),
    },
    pickers: {
      actor: Pickers.actor,
      props: ({ props, model }) => ({
        accountId: props.accountId,
        bindings: model.keyboard.bindings,
      }),
    },
    project: {
      actor: ProjectRow,
      while: ({ props }) => props.place !== null,
      props: ({ props }) => ({
        connectionId: props.place?.connectionId ?? '',
        projectId: props.place?.projectId ?? '',
      }),
    },
    session: {
      actor: SessionRow,
      while: ({ props }) => props.place?.sessionId != null,
      props: ({ props }) => ({
        connectionId: props.place?.connectionId ?? '',
        sessionId: props.place?.sessionId ?? '',
      }),
    },
  },
  workers: {
    // 1. Keys: a change here or in another tab, or one since the root page
    // read it, is read again.
    keyboard: {
      run: (self) =>
        Stream.runForEach(keyboard, (keyboard) =>
          self.send({ _tag: 'KeyboardRead', keyboard }),
        ),
    },
  },
  on: {
    // 1. Keys
    KeyboardRead: ({ keyboard }, { model }) =>
      sameKeys(keyboard, model.keyboard)
        ? {}
        : { model: { ...model, keyboard } },
    // Shown at once, and kept.
    VimChanged: ({ on }, { model }) => ({
      model: { ...model, keyboard: { ...model.keyboard, vim: on } },
      command: setVim({ on }),
    }),
    // 3. Go
    NewSessionAsked: ({ connectionId, projectId }) => ({
      command: Router.push(project(connectionId, projectId)),
    }),
    SettingsToggled: ({ from, back }, { model }) => {
      if (!back)
        return {
          model: { ...model, back: from },
          command: Router.push(settings()),
        };
      const to = model.back;
      return {
        model: { ...model, back: null },
        command: Router.push(
          to === null
            ? home()
            : to.sessionId === null
              ? project(to.connectionId, to.projectId)
              : session(to.connectionId, to.projectId, to.sessionId),
        ),
      };
    },
    BackAsked: () => ({ command: Router.back() }),
    ForwardAsked: () => ({ command: Router.forward() }),
    // 4. Shown, once, for good.
    Ready: (_, { model }) =>
      model.shown ? {} : { model: { ...model, shown: true } },
  },
});
