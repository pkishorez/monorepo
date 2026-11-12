import { Effect, Schema, Stream } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Preferences, PreferencesRead } from '../../storage/index.ts';
import { home, project, session, settings } from '../../app.ts';
import { ConnectionFilter, connectionFilterIdb } from './store.ts';
import { Header } from './header/index.ts';
import { Pickers } from './pickers/index.ts';
import { Sidebar } from './sidebar/index.ts';

/*
 * The frame: what is drawn around every page while its Account is the one
 * active, with the keys over all of it, for as long as the Account's page
 * is `Active`.
 *
 * 1. Keys      the keyboard of Preferences, the user's Bindings and
 *              whether Vim Mode is on, whether the app floats as a window,
 *              and the text size, is handed in as it starts, read by the
 *              Account's page before it draws, so the frame draws at once; then
 *              followed as it changes, and nothing else of Preferences.
 *              Vim Mode turned on or off shows at once and is kept; the
 *              window and the text size are chosen in Settings.
 * 2. Children  the sidebar (`sidebar/`), which keeps its own width and the
 *              Account's Connection Filter, which the frame gives it and
 *              the Project Picker (`store.ts`); the header (`header/`),
 *              where you are, with Voice, recording from anywhere; and
 *              the Pickers the keys open anywhere (`pickers/`), handed the
 *              Bindings.
 * 3. Go        starts a new session in the project open, opens Settings,
 *              remembering where it was opened from, so the same key goes
 *              back there, and goes Back and Forward through the pages.
 * 4. Shown     nothing of it is drawn, the Account's mark staying, until
 *              what it first draws is read from this device: the sidebar's
 *              rows, the header's, and the page's (`view.tsx`). Then it is
 *              drawn whole, in one step, and stays drawn. What the
 *              Connections answer after comes in behind, never waited for.
 */

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

const Frame = Actor.define('Frame', {
  requires: [Navigation, Preferences],
  /** The keyboard as the Account's page last read it. */
  input: Schema.Struct({ keyboard: Keys }),
  props: Schema.Struct({
    /** The Account, the one active. */
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

export const FrameLive = Frame.build({
  init: ({ keyboard }) => ({
    model: { back: null, keyboard, shown: false },
  }),
  // 2. Children: the Connection Filter, for the sidebar and the Project Picker.
  provides: {
    capabilities: [ConnectionFilter],
    layer: () => connectionFilterIdb,
  },
  children: {
    sidebar: Actor.child(Sidebar.actor, {
      props: ({ props }) => ({ accountId: props.accountId }),
    }),
    header: Actor.child(Header.actor, {
      props: ({ props }) => ({ place: props.place }),
    }),
    pickers: Actor.child(Pickers.actor, {
      props: ({ props, model }) => ({
        accountId: props.accountId,
        bindings: model.keyboard.bindings,
      }),
    }),
  },
  workers: {
    // 1. Keys: a change here or in another tab, or one since the Account's
    // page read it, is read again.
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
    NewSessionAsked: ({ connectionId, projectId }, { props }) => ({
      command: Router.push(project(props.accountId, connectionId, projectId)),
    }),
    SettingsToggled: ({ from, back }, { model, props }) => {
      const { accountId } = props;
      if (!back)
        return {
          model: { ...model, back: from },
          command: Router.push(settings(accountId)),
        };
      const to = model.back;
      return {
        model: { ...model, back: null },
        command: Router.push(
          to === null
            ? home(accountId)
            : to.sessionId === null
              ? project(accountId, to.connectionId, to.projectId)
              : session(accountId, to.connectionId, to.projectId, to.sessionId),
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
