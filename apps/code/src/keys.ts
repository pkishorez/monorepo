import { describe } from '@kestack/use-keys';
import {
  type ActionId,
  createKeys,
  type Definition,
} from '@kestack/use-keys/surfaces';
import { useCallback, useRef } from 'react';

/*
 * The app's whole keyboard: every Surface, as they nest, and every key.
 * It is always on: plain keys work in Normal Mode, and only the Actions
 * marked `inField` work while typing in the Composer or a Picker's search.
 * Two Surfaces are places to work: the sidebar and the page beside it, `h`
 * and `l` going between them. The page is one Surface for every place, and
 * its Draft is part of it: `i` makes it the Composer, and Escape leaves the
 * Composer for the page's Normal Mode, where Enter sends the Draft, `u`
 * undoes the last thing put in it, and `/` puts a Skill in at its cursor.
 * A session gives the page the transcript's keys while it is open. `o`,
 * `s` and `a` open the Project Picker, the Session Switcher and Session
 * Actions; `m`, `p` and `e` the model Picker at the model, the permissions
 * and the effort. Space starts or stops a Dictation, and `d` opens the
 * Microphone Picker, to choose what it records from. Only `Ctrl+,`,
 * Settings and back, Mod+., stopping the turn, Ctrl+Space, a Dictation
 * again, and Page Up and Page Down work while typing too; Ctrl+Space works
 * in a Picker as well, and Escape never touches a Dictation. Escape in
 * the sidebar goes back to the page. Every Picker, those three, the skills,
 * the model and the microphone, is drawn on the one isolated `picker` Surface, and the help
 * sheet on `help`: drawn while Active, they close when left and go back to
 * where they were opened from, focus too. A Picker's keys are its
 * Surface's Actions, taken before cmdk hears them. Settings has no keys of
 * its own: recording a new key for an Action enters the isolated `record`
 * Surface, which has none, so no key works until it is pressed; Escape
 * leaves it, which cancels. A confirmation, such as removing a project, is
 * drawn on the isolated `confirm` Surface, and the Background Jobs on
 * `jobs`, so leaving either puts focus back where it was.
 *
 * The Composer's editor takes its own keys first, so it hands the page the
 * `inField` ones. Actions without `enters` work only while a component
 * gives them a Handler.
 */

export const keys = createKeys({
  app: {
    label: 'anywhere',
    focusable: false,
    actions: {
      help: { keys: '?', label: 'Show the keys', enters: 'help' },
      side: { keys: 'h', label: 'Go to the sidebar', enters: 'sidebar' },
      page: { keys: 'l', label: 'Go to the page', enters: 'content' },
      projects: { keys: 'o', label: 'Open a project' },
      sessions: { keys: 's', label: 'Switch session' },
      actions: { keys: 'a', label: 'Session actions' },
      newSession: { keys: 'n', label: 'New session in this project' },
      sidebar: { keys: 'b', label: 'Show or hide the sidebar' },
      dictate: { keys: 'Space', label: 'Start or stop a Dictation' },
      microphone: { keys: 'd', label: 'Choose the microphone' },
      dictateAnywhere: {
        keys: 'ctrl+Space',
        label: 'Start or stop a Dictation, even while typing',
        always: true,
        inField: true,
      },
      settings: {
        keys: 'ctrl+,',
        label: 'Settings, or back from them',
        inField: true,
      },
    },
    surfaces: {
      sidebar: {
        actions: {
          next: { keys: 'j', label: 'Next row', repeat: true },
          previous: { keys: 'k', label: 'Previous row', repeat: true },
          first: { keys: 'g g', label: 'First row' },
          last: { keys: 'shift+g', label: 'Last row' },
          open: { keys: 'Enter', label: 'Open the row' },
          back: {
            keys: 'Escape',
            label: 'Back to the page',
            enters: 'content',
          },
        },
      },
      content: {
        label: 'page',
        initial: true,
        actions: {
          down: { keys: 'j', label: 'Scroll down', repeat: true },
          up: { keys: 'k', label: 'Scroll up', repeat: true },
          halfDown: { keys: 'ctrl+d', label: 'Half a page down', repeat: true },
          halfUp: { keys: 'ctrl+u', label: 'Half a page up', repeat: true },
          pageDown: {
            keys: 'PageDown',
            label: 'A page down',
            inField: true,
            repeat: true,
          },
          pageUp: {
            keys: 'PageUp',
            label: 'A page up',
            inField: true,
            repeat: true,
          },
          top: { keys: 'g g', label: 'To the top' },
          bottom: { keys: 'shift+g', label: 'To the bottom, following' },
          write: { keys: 'i', label: 'Edit the Draft' },
          send: { keys: 'Enter', label: 'Send the Draft' },
          undo: { keys: 'u', label: 'Undo the last thing put in the Draft' },
          skills: { keys: '/', label: 'Put a skill in the Draft' },
          model: { keys: 'm', label: 'Pick the model' },
          permissions: { keys: 'p', label: 'Pick the permissions' },
          effort: { keys: 'e', label: 'Pick the effort' },
          previousSession: {
            keys: '[',
            label: 'Previous session in the sidebar',
          },
          nextSession: { keys: ']', label: 'Next session in the sidebar' },
          stop: { keys: 'mod+.', label: 'Stop the turn', inField: true },
          close: {
            keys: 'Escape',
            label: 'Close the answer, or leave Settings',
          },
        },
        surfaces: {
          record: { label: 'recording a key', isolated: true },
          confirm: { label: 'confirming', isolated: true },
          jobs: { label: 'background jobs', isolated: true },
        },
      },
      picker: {
        label: 'picker',
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'Clear the search' },
          dictate: {
            keys: 'ctrl+Space',
            label: 'Start or stop a Dictation',
            always: true,
            inField: true,
          },
          back: {
            keys: ['ctrl+h', 'Backspace'],
            label: 'Back a step',
            inField: true,
          },
          pick: { keys: 'Enter', label: 'Pick the row', inField: true },
          into: { keys: 'ctrl+l', label: 'Go into the row', inField: true },
          finish: {
            keys: 'mod+Enter',
            label: 'Done, on the row highlighted',
            inField: true,
          },
          next: {
            keys: ['ctrl+n', 'ArrowDown'],
            label: 'Next row',
            inField: true,
            repeat: true,
          },
          previous: {
            keys: ['ctrl+p', 'ArrowUp'],
            label: 'Previous row',
            inField: true,
            repeat: true,
          },
        },
      },
      help: { label: 'keys', isolated: true },
    },
  },
});

/**
 * An Action's first keys as bound now, the user's own over the defaults,
 * as people write them, for a button's title or a row's hint; null when
 * it has none.
 */
export const useBound = (id: ActionId<typeof keys.definition>) => {
  const [first] = keys.useKeysOf(id);
  return first === undefined ? null : describe(first);
};

// Every Action of the definition, by id.
const actionsOf = (
  surfaces: Definition,
): ReadonlyArray<
  readonly [
    string,
    {
      readonly keys: string | ReadonlyArray<string>;
      readonly inField?: boolean;
    },
  ]
> =>
  Object.entries(surfaces).flatMap(
    ([surface, { actions, surfaces: inner }]) => [
      ...Object.entries(actions ?? {}).map(
        ([name, action]) => [`${surface}.${name}`, action] as const,
      ),
      ...actionsOf(inner ?? {}),
    ],
  );

const actions = new Map(actionsOf(keys.definition));

/** Whether an Action works while typing, so a plain key cannot be its own. */
export const worksWhileTyping = (id: string) =>
  actions.get(id)?.inField === true;

/**
 * An Action's first keys under the user's Bindings, else its defaults, as
 * people write them, for an actor that names them; null with none.
 */
export const boundIn = (
  bindings: Readonly<Record<string, ReadonlyArray<string>>>,
  id: ActionId<typeof keys.definition>,
) => {
  const written = bindings[id] ?? actions.get(id)?.keys ?? [];
  return (typeof written === 'string' ? written : written[0]) ?? null;
};

/**
 * For a text editor with keys of its own, such as the Composer's: runs the
 * Action that works now while typing whose keys, as bound now, are the
 * keys pressed, as people write them, and says whether there was one. The
 * editor takes the key before the page could, so it hands it on.
 */
export const useTypingKeys = () => {
  const available = keys.useAvailableActions();
  const latest = useRef(available);
  latest.current = available;
  return useCallback((pressed: string) => {
    const action = latest.current.find(
      ({ id, shadowed, keys: bound }) =>
        !shadowed &&
        worksWhileTyping(id) &&
        bound.some((each) => describe(each) === pressed),
    );
    action?.run();
    return action !== undefined;
  }, []);
};
