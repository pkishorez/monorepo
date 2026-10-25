import { useChild, View } from '@kestack/kabuki/react';
import { createContext, type ReactNode, use } from 'react';
import type { Written } from '../../../../../layer/capabilities/index.ts';
import { DraftModeLive, type Mode } from './actor.ts';
import { TouchDraft } from './touch/index.ts';

/*
 * A Draft Mode is drawn as the Draft's card around its own text: the
 * Draft says how through `Compose`, and the mode hands it its text, its
 * own edits and sends, and its Touch Draft, drawn. Only the mode open is
 * drawn.
 */

/** What a mode hands the Draft's card. */
export interface Composing {
  readonly mode: Mode;
  readonly written: Written;
  readonly onEdit: (written: Written) => void;
  readonly onSend: () => void;
  /** Its Touch Draft, drawn, for a device with no keyboard. */
  readonly touch: ReactNode;
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
      touch: <TouchDraft.view instance={children.touch} />,
      editing,
    });
  },
);
