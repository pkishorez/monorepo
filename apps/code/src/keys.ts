import { describe } from '@kestack/use-keys';
import {
  type ActionId,
  createKeys,
  type Definition,
} from '@kestack/use-keys/surfaces';
import { useCallback, useRef } from 'react';

/*
 * The app's whole keyboard: every Surface, as they nest, and every key.
 * Two Surfaces are places to work: the sidebar and the page beside it. The
 * page is one Surface for every place, and its composer is part of it: `i`
 * writes in the composer, and Escape leaves it for the page's Normal Mode.
 * A session gives the page the transcript's keys while it is open. From
 * anywhere, even while typing, Ctrl and a letter open the Project Picker,
 * the Session Switcher and Session Actions, start a new session, show or
 * hide the sidebar, go to the sidebar or the page, and go to Settings and
 * back; Escape in the sidebar goes back to the page. Every Picker, those three,
 * the skills and the model, is drawn on the one isolated `picker`
 * Surface, and the help sheet on `help`: drawn while Active, they close when
 * left and go back to where they were opened from, focus too. A Picker's
 * keys are its Surface's Actions, taken before cmdk hears them. Settings has
 * no keys of its own: recording a new key for an Action enters the isolated
 * `record` Surface, which has none, so no key works until it is pressed;
 * Escape leaves it, which cancels. A confirmation, such as removing a
 * project, is drawn on the isolated `confirm` Surface, and the Background
 * Jobs on `jobs`, so leaving either puts focus back where it was.
 *
 * Everything is Vim Mode only unless `always`. While typing in the
 * composer only `mod` keys and `inField` Actions reach the page; the
 * editor's own keys that would clash are taken out of it.
 * Actions without `enters` work only while a component gives them a
 * Handler.
 */

export const keys = createKeys({
  app: {
    label: 'anywhere',
    focusable: false,
    actions: {
      vim: {
        keys: 'mod+alt+v',
        label: 'Turn Vim Mode on or off',
        always: true,
      },
      help: { keys: '?', label: 'Show the keys', enters: 'help' },
      side: {
        keys: 'ctrl+h',
        label: 'Go to the sidebar',
        always: true,
        inField: true,
        enters: 'sidebar',
      },
      // Its own Action: a plain key working while typing would type.
      sideByLeader: {
        keys: 'Space e',
        label: 'Go to the sidebar, in Vim Mode',
        enters: 'sidebar',
      },
      page: {
        keys: 'ctrl+l',
        label: 'Go to the page',
        always: true,
        inField: true,
        enters: 'content',
      },
      projects: {
        keys: 'ctrl+p',
        label: 'Open a project',
        always: true,
        inField: true,
      },
      sessions: {
        keys: 'ctrl+j',
        label: 'Switch session',
        always: true,
        inField: true,
      },
      actions: {
        keys: 'ctrl+k',
        label: 'Session actions',
        always: true,
        inField: true,
      },
      newSession: {
        keys: 'ctrl+n',
        label: 'New session in this project',
        always: true,
        inField: true,
      },
      sidebar: {
        keys: 'ctrl+b',
        label: 'Show or hide the sidebar',
        always: true,
        inField: true,
      },
      settings: {
        keys: 'ctrl+,',
        label: 'Settings, or back from them',
        always: true,
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
            always: true,
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
            always: true,
            inField: true,
            repeat: true,
          },
          pageUp: {
            keys: 'PageUp',
            label: 'A page up',
            always: true,
            inField: true,
            repeat: true,
          },
          top: { keys: 'g g', label: 'To the top' },
          bottom: { keys: 'shift+g', label: 'To the bottom, following' },
          write: { keys: 'i', label: 'Write a message' },
          previousSession: {
            keys: 'ctrl+[',
            label: 'Previous session in the sidebar',
            always: true,
            inField: true,
          },
          nextSession: {
            keys: 'ctrl+]',
            label: 'Next session in the sidebar',
            always: true,
            inField: true,
          },
          model: {
            keys: 'ctrl+m',
            label: 'Pick the model',
            always: true,
            inField: true,
          },
          stop: { keys: 'mod+.', label: 'Stop the turn', always: true },
          close: {
            keys: 'Escape',
            label: 'Close the answer, or leave Settings',
            always: true,
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
          clear: { keys: 'Escape', label: 'Clear the search', always: true },
          back: {
            keys: ['ctrl+h', 'Backspace'],
            label: 'Back a step',
            always: true,
            inField: true,
          },
          pick: {
            keys: 'Enter',
            label: 'Pick the row',
            always: true,
            inField: true,
          },
          into: {
            keys: 'ctrl+l',
            label: 'Go into the row',
            always: true,
            inField: true,
          },
          finish: {
            keys: 'mod+Enter',
            label: 'Done, on the row highlighted',
            always: true,
            inField: true,
          },
          next: {
            keys: ['ctrl+n', 'ArrowDown'],
            label: 'Next row',
            always: true,
            inField: true,
            repeat: true,
          },
          previous: {
            keys: ['ctrl+p', 'ArrowUp'],
            label: 'Previous row',
            always: true,
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
 * For a text editor with keys of its own, such as the composer's: runs the
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
