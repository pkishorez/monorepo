import { useEffect, useState } from 'react';
import { describe, shortcut, type Binding } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

/**
 * Every key of the Stories canvas. The space walks and runs the cards; the
 * Proof panel cuts the space off while it is open; the player inside it
 * plays, seeks and goes full screen.
 */
export const storiesKeys = createKeys({
  surfaces: {
    stories: {
      actions: {
        parent: {
          keys: [shortcut('h'), shortcut('ArrowLeft')],
          description: 'parent',
          repeat: true,
        },
        firstChild: {
          keys: [shortcut('l'), shortcut('ArrowRight')],
          description: 'first sub-Story, opening it',
          repeat: true,
        },
        nextSibling: {
          keys: [shortcut('j'), shortcut('ArrowDown')],
          description: 'next sibling',
          repeat: true,
        },
        previousSibling: {
          keys: [shortcut('k'), shortcut('ArrowUp')],
          description: 'previous sibling',
          repeat: true,
        },
        toggle: { keys: [shortcut('Enter')], description: 'opens or closes' },
        run: { keys: [shortcut('Space')], description: 'runs' },
      },
      surfaces: {
        'proof-panel': {
          isolated: true,
          actions: {
            close: {
              keys: [shortcut('Escape')],
              description: 'Close the Proof',
            },
          },
          surfaces: {
            player: {
              actions: {
                playPause: {
                  keys: [shortcut('Space')],
                  description: 'Play or pause',
                },
                fullScreen: {
                  keys: [shortcut('f')],
                  description: 'Full screen',
                },
                exitFullScreen: {
                  keys: [shortcut('Escape')],
                  description: 'Leave full screen',
                },
                seekBack: {
                  keys: [shortcut('ArrowLeft')],
                  description: 'Seek back',
                  repeat: true,
                },
                seekForward: {
                  keys: [shortcut('ArrowRight')],
                  description: 'Seek forward',
                  repeat: true,
                },
              },
            },
          },
        },
      },
    },
  },
});

export const panelSurface = 'stories.proof-panel';
export const playerSurface = 'stories.proof-panel.player';

const arrows: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

/** A Binding as the hint line shows it: arrows as arrows. */
export const keyLabel = (binding: Binding) => {
  const written = describe(binding);
  return arrows[written] ?? written;
};

/** The element with focus, kept as state so Actions can follow it. */
export function useActiveElement() {
  const [active, setActive] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => setActive(document.activeElement);
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return active;
}

/** Native controls, whose Enter and Space click them. */
export const nativeControls =
  'button, a[href], input, select, textarea, summary';

/** Whether `active` is a control inside `within` that keeps Enter and Space. */
export const keepsKeys = (
  active: Element | null,
  within: Element | null,
  controls = nativeControls,
) =>
  active !== null &&
  within !== null &&
  within.contains(active) &&
  active.closest(controls) !== null;

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
