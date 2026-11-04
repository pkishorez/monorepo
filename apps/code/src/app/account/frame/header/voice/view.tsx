import { View } from '@kestack/kabuki/react';
import { createContext, use, useMemo, useRef, type ReactNode } from 'react';
import type { Ask } from './voice.ts';
import { Dictation } from './dictation/index.ts';
import { Microphone } from './microphone/index.ts';
import { VoiceLive } from './actor.ts';

/*
 * Voice's View, around the screen: the Dictation handed down to every
 * field that dictates and to the frame, with the fields drawn for the keys, with the Microphone Picker's button for the Status
 * Line and how to open it from a tap elsewhere. What it draws, the
 * Microphone Picker and the Dictation's badge in the bottom right corner,
 * the frame draws inside its keyboard, where it also binds Space, Ctrl+Space
 * and `d`.
 */

/** What Voice is drawn around: the screen, from the frame. */
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
        <Microphone.Keys value={keys}>
          <Microphone.button instance={children.microphone} />
        </Microphone.Keys>
      ),
      chooseMicrophone: (how: 'keys' | 'touch') => microphones.current?.(how),
      drawn: (
        <>
          {/* Opened by keys, or from elsewhere: no button of its own here. */}
          <Microphone.view instance={children.microphone} />
          <Dictation.view instance={children.dictation} />
        </>
      ),
    }),
    [children.dictation, children.microphone, send, drawnFields],
  );
  return (
    <Dictation.Dictating value={dictating}>
      <Microphone.Opener value={microphones}>{use(Around)}</Microphone.Opener>
    </Dictation.Dictating>
  );
});
