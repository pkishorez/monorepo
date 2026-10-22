import { createKeys } from '@kestack/use-keys/surfaces';

/*
 * The app's whole keyboard: every Surface, as they nest, and every key.
 * Two Surfaces are places to work: the sidebar and the page beside it. The
 * page is one Surface for every place, and its composer is part of it: `i`
 * writes in the composer, and Escape leaves it for the page's Normal Mode.
 * A session gives the page the transcript's keys while it is open. The
 * skills palette, the model picker and the help sheet are isolated panels:
 * drawn while Active, they close when left and go back to where they were
 * opened from.
 *
 * Everything is Vim Mode only unless `always`. While typing in the
 * composer only `mod` keys and `inField` Actions reach the page; the
 * editor's own keys that would clash are taken out of it.
 * Actions without `enters` work only while a component gives them a
 * Handler.
 */

export const keys = createKeys({
  app: {
    focusable: false,
    actions: {
      vim: {
        keys: 'mod+alt+v',
        label: 'Turn Vim Mode on or off',
        always: true,
      },
      help: { keys: '?', label: 'Show the keys', enters: 'help' },
      side: {
        keys: ['ctrl+h', 'Space e'],
        label: 'Go to the sidebar',
        enters: 'sidebar',
      },
      page: { keys: 'ctrl+l', label: 'Go to the page', enters: 'content' },
    },
    surfaces: {
      sidebar: {
        actions: {
          next: { keys: 'j', label: 'Next row', repeat: true },
          previous: { keys: 'k', label: 'Previous row', repeat: true },
          first: { keys: 'g g', label: 'First row' },
          last: { keys: 'shift+g', label: 'Last row' },
          collapse: { keys: 'h', label: 'Fold the project' },
          expand: { keys: 'l', label: 'Unfold the project' },
          open: { keys: 'Enter', label: 'Open the row', enters: 'content' },
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
            label: 'Previous session',
            inField: true,
          },
          nextSession: { keys: 'ctrl+]', label: 'Next session', inField: true },
          model: {
            keys: 'mod+shift+m',
            label: 'Pick the model',
            always: true,
          },
          stop: { keys: 'mod+.', label: 'Stop the turn', always: true },
          closeAnswer: {
            keys: 'Escape',
            label: 'Close the answer',
            always: true,
          },
        },
      },
      palette: {
        label: 'skills',
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'Clear the search', always: true },
        },
      },
      picker: {
        label: 'model',
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'Clear the search', always: true },
        },
      },
      help: { label: 'keys', isolated: true },
    },
  },
});

/** An Action's keys as people write them, for a button's title. */
export const keysOf = {
  vim: keys.definition.app.actions.vim.keys,
  stop: keys.definition.app.surfaces.content.actions.stop.keys,
  model: keys.definition.app.surfaces.content.actions.model.keys,
};
