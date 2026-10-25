import { View } from '@kestack/kabuki/react';
import { createContext, use, useEffect, type RefObject } from 'react';
import { DraftModeLive, type Mode, type Written } from './actor.ts';

/*
 * A Draft Mode draws nothing of its own: the Draft's one editor shows
 * the mode that is active. Its View is where the editor's edits reach it,
 * through `Edits`, as the Touch Draft's View hands the Draft its send;
 * and where it takes a reset the Draft has set for it.
 */

/** Where each mode's View says how an edit reaches it, by mode. */
export const Edits = createContext<RefObject<
  Partial<Record<Mode, (written: Written) => void>>
> | null>(null);

export const DraftModeView = View.make(
  DraftModeLive,
  ({ model, props, send }) => {
    const edits = use(Edits);
    if (edits === null)
      throw new Error('A Draft Mode is drawn only in a Draft');
    const { mode, reset } = props;
    useEffect(() => {
      edits.current[mode] = (written) => send({ _tag: 'Edited', ...written });
      return () => void delete edits.current[mode];
    });
    useEffect(() => {
      if (reset !== null && reset.id > model.reset)
        send({ _tag: 'ResetTaken' });
    }, [reset?.id, model.reset]);
    return null;
  },
);
