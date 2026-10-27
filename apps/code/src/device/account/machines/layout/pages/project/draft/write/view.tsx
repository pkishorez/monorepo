import { useChild, View } from '@kestack/kabuki/react';
import { type ComponentProps, createContext, type ReactNode, use } from 'react';
import type { Written } from '../../../../../machine/store/index.ts';
import {
  blank,
  DraftModeLive,
  Given,
  Mode,
  modesOf,
  owner,
  takes,
} from './actor.ts';
import { TouchDraft } from './touch/index.ts';

export type { Mode } from './actor.ts';

/*
 * A Draft Mode is drawn as the Draft's card around its own text: the
 * Draft says how through `Compose`, and the mode hands it its text, its
 * own edits and sends, and its Touch Draft, drawn with what the Draft
 * hands it. Only the mode open is drawn.
 */

/** What a mode hands the Draft's card. */
export interface Composing {
  readonly mode: Mode;
  readonly written: Written;
  readonly onEdit: (written: Written) => void;
  readonly onSend: () => void;
  /** Its Touch Draft, drawn with what the Draft hands it, for a device with no keyboard. */
  readonly touch: (
    given: NonNullable<ComponentProps<typeof TouchDraft.Touch>['value']>,
  ) => ReactNode;
  /** The Touch Draft is being edited: the Composer. */
  readonly editing: boolean;
}

/** How the Draft draws a mode: its card, around the mode's own text. */
export const Compose = createContext<((mode: Composing) => ReactNode) | null>(
  null,
);

export const DraftModeView = View.make(
  DraftModeLive,
  ({ model, props, children, send }) => {
    const compose = use(Compose);
    if (compose === null)
      throw new Error('A Draft Mode is drawn only in a Draft');
    const editing =
      useChild(children.touch, ({ state }) => state._tag === 'Editing') ===
      true;
    return compose({
      mode: props.mode,
      written: model.written,
      onEdit: (written) => send({ _tag: 'Edited', ...written }),
      onSend: () => send({ _tag: 'SendAsked' }),
      touch: (given) => (
        <TouchDraft.Touch value={given}>
          <TouchDraft.view instance={children.touch} />
        </TouchDraft.Touch>
      ),
      editing,
    });
  },
);

/**
 * A Draft Mode, as the Draft holds it: its Actor and View, how the Draft
 * draws it and what it Provides it. Light: the card and its editor load
 * with the Draft's own View.
 */
export const DraftMode = {
  actor: DraftModeLive,
  view: DraftModeView,
  /** How the Draft draws a mode: its card, around the mode's own text. */
  Compose,
  /** The Layer the Draft Provides: what each mode shows and hands it. */
  owner,
  Mode,
  Given,
  blank,
  modesOf,
  takes,
  /** Load the Touch Draft's code before it is drawn. */
  preload: () => TouchDraft.view.preload(),
};
