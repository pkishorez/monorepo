import { View } from '@kestack/kabuki/react';
import { createContext, use, useMemo, useRef, type ReactNode } from 'react';
import type { Ask } from './voice.ts';
import { Dictation } from './dictation/index.ts';
import { MicrophonePicker } from './microphone-picker/index.ts';
import { VoiceLive } from './actor.ts';

/*
 * Voice's View, around the screen: the Dictation handed down to every
 * field that dictates and to Layout, with the fields drawn for the keys, with the Microphone Picker's button for the Status
 * Line and how to open it from a tap elsewhere. What it draws, the
 * Microphone Picker and the Dictation's badge in the bottom right corner,
 * Layout draws inside its keyboard, where it also binds Space, Ctrl+Space
 * and `d`.
 */

/** What Voice is drawn around: the screen, from the root page. */
export const Around = createContext<ReactNode>(null);

export const VoiceView = View.make(VoiceLive, ({ children, send }) => {
  const microphones = useRef<((how: 'keys' | 'touch') => void) | null>(null);
  // The fields drawn, for the keys: one list for as long as Voice is.
  const drawnFields = useMemo(Dictation.owners, []);
  // The Dictation itself is handed down, never its State, which moves
  // with every level heard: what reads it draws again, nothing else.
  const dictating = useMemo(
    () => ({
      dictation: children.dictation,
      ask: (ask: typeof Ask.Type) => send({ _tag: 'DictationAsked', ask }),
      owners: drawnFields,
      microphones: (keys: string | null) => (
        <MicrophonePicker.Keys value={keys}>
          <MicrophonePicker.button instance={children.microphonePicker} />
        </MicrophonePicker.Keys>
      ),
      chooseMicrophone: (how: 'keys' | 'touch') => microphones.current?.(how),
      drawn: (
        <>
          {/* Opened by keys, or from elsewhere: no button of its own here. */}
          <MicrophonePicker.view instance={children.microphonePicker} />
          <Dictation.view instance={children.dictation} />
        </>
      ),
    }),
    [children.dictation, children.microphonePicker, send, drawnFields],
  );
  return (
    <Dictation.Dictating value={dictating}>
      <MicrophonePicker.Opener value={microphones}>
        {use(Around)}
      </MicrophonePicker.Opener>
    </Dictation.Dictating>
  );
});
