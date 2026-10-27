import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Ask, Dictations } from './voice.ts';
import { askDictation } from './commands.ts';
import { Dictation } from './dictation/index.ts';
import { MicrophonePicker } from './microphone-picker/index.ts';

/*
 * Voice: recording from anywhere, a Child of Machines, so it carries on
 * while the user moves between pages, Settings too.
 *
 * 1. Dictation  the one Dictation, which records, has it written out, and
 *               hands the text to the Draft on screen as it stops, or
 *               keeps it in its list while none is.
 * 2. Microphone the Microphone Picker, which chooses what it records from.
 * 3. Ask        Space, Ctrl+Space, the header's mic, a Draft's mic, and
 *               every Draft saying it is drawn, ask here; each ask is
 *               handed on through `Dictations`, heard only while its
 *               Account is the one drawn.
 */

const Voice = Actor.define('Voice', {
  requires: [Dictations],
  props: Schema.Struct({
    /** Whether its Account is the one drawn. */
    drawn: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    /** Space, Ctrl+Space, a mic, or a Draft: for the Dictation. */
    DictationAsked: { ask: Ask },
  }),
});

export const VoiceLive = Actor.build(Voice, {
  children: {
    // 1. Dictation
    dictation: {
      actor: Dictation.actor,
      props: ({ props }) => ({ drawn: props.drawn }),
    },
    // 2. Microphone
    microphonePicker: { actor: MicrophonePicker.actor },
  },
  on: {
    // 3. Ask
    DictationAsked: ({ ask }) => ({ command: askDictation(ask) }),
  },
});
