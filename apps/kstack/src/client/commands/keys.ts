import { sequence, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

/**
 * Every Command of Ledger, with its keys, in one place. The Global ones
 * are the vocabulary every Place speaks — Go, Jump, Next, Previous, Add —
 * each Place answering them in its own way; each Surface adds what only
 * it does. The Sidebar, Add, the Account sheet and the palette are
 * Isolated: the Place's own keys stop while they have the keys.
 */
export const definition = {
  actions: {
    openPalette: {
      keys: [shortcut('mod+k')],
      description: 'Find a command',
      inTextEntry: true,
    },
    addEntry: { keys: [shortcut('c')], description: 'Add an entry' },
    jump: { keys: [shortcut('-')], description: 'Jump to the list' },
    next: {
      keys: [shortcut('j'), shortcut('ArrowDown')],
      description: 'Next',
      repeat: true,
    },
    previous: {
      keys: [shortcut('k'), shortcut('ArrowUp')],
      description: 'Previous',
      repeat: true,
    },
    toHome: { keys: [sequence('g h')], description: 'Go home' },
    toEntries: { keys: [sequence('g e')], description: 'Go to entries' },
    toMonths: { keys: [sequence('g m')], description: 'Go to months' },
    toSettings: { keys: [sequence('g s')], description: 'Go to settings' },
    toggleSidebar: {
      keys: [shortcut('[')],
      description: 'Show or hide the sidebar',
    },
    focusSidebar: {
      keys: [sequence('Space e')],
      description: 'Move the keys to the sidebar',
    },
    theme: { keys: [shortcut('t')], description: 'Switch the theme' },
    help: { keys: [shortcut('?')], description: 'Every key and gesture' },
  },
  surfaces: {
    sidebar: {
      actions: {
        down: {
          keys: [shortcut('j'), shortcut('ArrowDown')],
          description: 'Next place',
          repeat: true,
        },
        up: {
          keys: [shortcut('k'), shortcut('ArrowUp')],
          description: 'Previous place',
          repeat: true,
        },
        leave: {
          keys: [shortcut('Escape')],
          description: 'Give the keys back',
        },
      },
    },
    home: {
      actions: {
        open: { keys: [shortcut('Enter')], description: 'Open this month' },
      },
    },
    entries: {
      actions: {
        open: {
          keys: [shortcut('Enter'), shortcut('l')],
          description: 'Open the entry',
        },
        top: { keys: [sequence('g g')], description: 'First entry' },
        bottom: { keys: [shortcut('shift+g')], description: 'Last entry' },
        remove: { keys: [sequence('d d')], description: 'Delete the entry' },
        undo: {
          keys: [shortcut('u')],
          description: 'Bring back the deleted entry',
        },
      },
      surfaces: {
        entry: {
          actions: {
            back: {
              keys: [shortcut('Escape'), shortcut('h')],
              description: 'Back to the list',
            },
            edit: { keys: [shortcut('e')], description: 'Edit the memo' },
            remove: {
              keys: [sequence('d d')],
              description: 'Delete the entry',
            },
            way: {
              keys: [shortcut('i')],
              description: 'Switch money in and out',
            },
          },
        },
      },
    },
    months: {
      actions: {
        open: {
          keys: [shortcut('Enter'), shortcut('l')],
          description: 'Open the month',
        },
      },
      surfaces: {
        month: {
          actions: {
            back: {
              keys: [shortcut('Escape'), shortcut('h')],
              description: 'Back to the months',
            },
            open: { keys: [shortcut('Enter')], description: 'Its entries' },
          },
        },
      },
    },
    add: {
      isolated: true,
      actions: {
        save: {
          keys: [shortcut('mod+Enter')],
          description: 'Save the entry',
          inTextEntry: true,
        },
        way: {
          keys: [shortcut('mod+i')],
          description: 'Switch money in and out',
          inTextEntry: true,
        },
        cancel: {
          keys: [shortcut('Escape')],
          description: 'Close without saving',
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
    account: {
      isolated: true,
      actions: {
        cancel: {
          keys: [shortcut('Escape')],
          description: 'Close without saving',
        },
      },
    },
    settings: {
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

/** Where the keys go: one Surface of Ledger. */
export type Surface = ProviderProps['surface'];

/** The user's own keys, by Action id. */
export type Bindings = NonNullable<ProviderProps['bindings']>;

/** An Action's id. */
export type ActionId = Parameters<typeof keys.useAction>[0];
