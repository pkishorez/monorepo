import { createKeys } from '@kestack/use-keys/surfaces';

export {
  keepsKeys,
  keyLabel,
  nativeControls,
  useActiveElement,
} from '../../canvas-space';

/**
 * Every key of the Stories canvas. The space walks and runs the cards; the
 * Proof panel cuts the space off while it is open; the player inside it
 * plays, seeks and goes full screen. Devtools has no Vim Mode, so every
 * key is `always`.
 */
export const storiesKeys = createKeys({
  stories: {
    actions: {
      parent: {
        keys: ['h', 'ArrowLeft'],
        label: 'parent',
        always: true,
        repeat: true,
      },
      firstChild: {
        keys: ['l', 'ArrowRight'],
        label: 'first sub-Story, opening it',
        always: true,
        repeat: true,
      },
      nextSibling: {
        keys: ['j', 'ArrowDown'],
        label: 'next sibling',
        always: true,
        repeat: true,
      },
      previousSibling: {
        keys: ['k', 'ArrowUp'],
        label: 'previous sibling',
        always: true,
        repeat: true,
      },
      toggle: { keys: 'Enter', label: 'opens or closes', always: true },
      run: { keys: 'Space', label: 'runs', always: true },
    },
    surfaces: {
      'proof-panel': {
        isolated: true,
        actions: {
          close: {
            keys: 'Escape',
            label: 'Close the Proof',
            always: true,
          },
        },
        surfaces: {
          player: {
            actions: {
              playPause: {
                keys: 'Space',
                label: 'Play or pause',
                always: true,
              },
              fullScreen: {
                keys: 'f',
                label: 'Full screen',
                always: true,
              },
              exitFullScreen: {
                keys: 'Escape',
                label: 'Leave full screen',
                always: true,
              },
              seekBack: {
                keys: 'ArrowLeft',
                label: 'Seek back',
                always: true,
                repeat: true,
              },
              seekForward: {
                keys: 'ArrowRight',
                label: 'Seek forward',
                always: true,
                repeat: true,
              },
            },
          },
        },
      },
    },
  },
});

export const panelSurface = 'proof-panel';
export const playerSurface = 'player';

/** Where the keys of the space are when Enter or Space is pressed. */
export type SpaceFocus = {
  /** The highlighted card. */
  readonly card: string;
  /** The Proof row with focus, if any. */
  readonly proof: string | undefined;
  /** Whether a control in the canvas has focus and keeps the key. */
  readonly control: boolean;
};

/**
 * What Space runs: the focused Proof row, else the highlighted card, wherever
 * the page's focus is. A button or link with focus never keeps Space: in the
 * space, Space always runs.
 */
export const spaceRuns = (focus: SpaceFocus): string =>
  focus.proof ?? focus.card;

/** What Enter does: opens the focused Proof row, else toggles the card. */
export const enterDoes = (
  focus: SpaceFocus,
): { readonly kind: 'proof' | 'toggle'; readonly key: string } | undefined =>
  focus.control
    ? undefined
    : focus.proof !== undefined
      ? { kind: 'proof', key: focus.proof }
      : { kind: 'toggle', key: focus.card };
