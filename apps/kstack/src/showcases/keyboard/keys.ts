import { sequence, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

/**
 * Every key of the notes app in one place: the Global Actions, then each
 * Surface. The palette and settings are Isolated, so the list's keys stop
 * while they are open; the palette and recording turn the Globals off too.
 */
export const definition = {
  actions: {
    commands: {
      keys: [shortcut('mod+k')],
      description: 'Open the command palette',
      inTextEntry: true,
    },
    help: { keys: [shortcut('?')], description: 'Show or hide every key' },
    hide: { keys: [shortcut('Escape')], description: 'Hide the key list' },
    customize: { keys: [sequence('g s')], description: 'Change the keys' },
  },
  surfaces: {
    notes: {
      actions: {
        down: {
          keys: [shortcut('j'), shortcut('ArrowDown')],
          description: 'Next note',
          repeat: true,
        },
        up: {
          keys: [shortcut('k'), shortcut('ArrowUp')],
          description: 'Previous note',
          repeat: true,
        },
        top: { keys: [sequence('g g')], description: 'First note' },
        bottom: { keys: [shortcut('shift+g')], description: 'Last note' },
        open: { keys: [shortcut('Enter')], description: 'Edit the note' },
        create: { keys: [shortcut('n')], description: 'New note' },
        remove: { keys: [sequence('d d')], description: 'Delete the note' },
      },
      surfaces: {
        editor: {
          actions: {
            back: {
              keys: [shortcut('Escape')],
              description: 'Back to the list',
            },
            done: {
              keys: [shortcut('mod+Enter')],
              description: 'Back to the list, from the text',
              inTextEntry: true,
            },
          },
        },
      },
    },
    palette: {
      isolated: true,
      globals: false,
      actions: {
        down: {
          keys: [shortcut('ArrowDown'), shortcut('ctrl+n')],
          description: 'Next command',
          repeat: true,
        },
        up: {
          keys: [shortcut('ArrowUp'), shortcut('ctrl+p')],
          description: 'Previous command',
          repeat: true,
        },
        run: { keys: [shortcut('Enter')], description: 'Run the command' },
        close: { keys: [shortcut('Escape')], description: 'Close the palette' },
      },
    },
    settings: {
      isolated: true,
      actions: {
        close: {
          keys: [shortcut('Escape')],
          description: 'Close the settings',
        },
      },
      surfaces: {
        recording: {
          globals: false,
          actions: {
            cancel: {
              keys: [shortcut('Escape')],
              description: 'Stop recording',
            },
          },
        },
      },
    },
  },
} as const;

export const keys = createKeys(definition);

type ProviderProps = Parameters<typeof keys.Provider>[0];

/** Where the user is: one Surface of the notes app. */
export type Surface = ProviderProps['surface'];

/** The user's own keys, by Action id. */
export type Bindings = NonNullable<ProviderProps['bindings']>;

/** An Action's id. */
export type ActionId = Parameters<typeof keys.useAction>[0];
