import { View } from '@kestack/kabuki/react';
import { useEffect, useRef } from 'react';
import { keys } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { KeysPickerLive, KeysView } from './actor.ts';

/*
 * The Keys Picker, opened centred by `?` in Vim Mode or Ctrl+/ in either,
 * from anywhere; it has no button of its own, but the Status Line's help
 * runs Ctrl+/'s Action. It lists what worked where it was opened from, as
 * the keyboard said just before the Picker took it, and the Action chosen
 * runs after the Picker has closed, back where the user was.
 */

export const KeysPickerView = View.make(
  KeysPickerLive,
  ({ model, children, send }) => {
    const open = Picker.useOpen();
    const available = keys.useAvailableActions();
    const latest = useRef(available);
    latest.current = available;
    const { vim } = keys.useKeyboard();
    const show = () => {
      const working = latest.current
        .filter(({ shadowed }) => !shadowed)
        .map(({ id }) => id);
      open(() =>
        send({ _tag: 'Open', how: 'keys', available: working, vim: vim.on }),
      );
    };
    keys.useAction('app.help', show);
    keys.useAction('app.helpAnywhere', show);
    useEffect(() => {
      if (model.chosen === null) return;
      latest.current.find(({ id }) => id === model.chosen)?.run();
      send({ _tag: 'Ran' });
    }, [model.chosen, send]);
    return (
      <Picker.Frame how={model.picking} mode="sheet" label="Keys">
        {children.picker && <KeysView instance={children.picker} />}
      </Picker.Frame>
    );
  },
);
