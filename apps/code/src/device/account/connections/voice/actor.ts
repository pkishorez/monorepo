import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Ask, Dictations } from './voice.ts';
import { askDictation } from './commands.ts';
import { Dictation } from './dictation/index.ts';
import { MicrophonePicker } from './microphone-picker/index.ts';

/*
 * Voice: recording from anywhere, a Child of Connections, so it carries on
 * while the user moves between pages, Settings too.
 *
 * 1. Dictation  the one Dictation, which records, has it written out, and
 *               keeps the text for the field that started it until that
 *               field takes it.
 * 2. Microphone the Microphone Picker, which chooses what it records from.
 * 3. Ask        Space, Ctrl+Space, a field's mic and the header's cancel
 *               ask here; each ask is
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
    /** Space, Ctrl+Space, a mic, or a cancel: for the Dictation. */
    DictationAsked: { ask: Ask },
  }),
});

export const VoiceLive = Voice.build({
  children: {
    // 1. Dictation
    dictation: Actor.child(Dictation.actor, {
      props: ({ props }) => ({ drawn: props.drawn }),
    }),
    // 2. Microphone
    microphonePicker: Actor.child(MicrophonePicker.actor),
  },
  on: {
    // 3. Ask
    DictationAsked: ({ ask }) => ({ command: askDictation(ask) }),
  },
});
