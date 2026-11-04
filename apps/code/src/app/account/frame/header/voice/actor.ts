import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Ask, Voice } from './voice.ts';
import { askDictation } from './commands.ts';
import { Dictation } from './dictation/index.ts';
import { Microphone } from './microphone/index.ts';
import { recorder } from './recorder/index.ts';

/*
 * Voice: recording from anywhere, a Child of the header, which is drawn
 * around every page, so it carries on while the user moves between pages,
 * Settings too. It gives its Children the microphone (`recorder/`).
 *
 * 1. Dictation  the one Dictation, which records, has it written out, and
 *               keeps the text for the field that started it until that
 *               field takes it.
 * 2. Microphone the Microphone Picker, which chooses what it records from.
 * 3. Ask        Space, Ctrl+Space, a field's mic and the header's cancel
 *               ask here; each ask is
 *               handed on through `Voice`.
 */

const Spoken = Actor.define('Voice', {
  requires: [Voice],
  message: Schema.TaggedUnion({
    /** Space, Ctrl+Space, a mic, or a cancel: for the Dictation. */
    DictationAsked: { ask: Ask },
  }),
});

export const VoiceLive = Spoken.build({
  provides: () => recorder,
  children: {
    // 1. Dictation
    dictation: Actor.child(Dictation.actor),
    // 2. Microphone
    microphone: Actor.child(Microphone.actor),
  },
  on: {
    // 3. Ask
    DictationAsked: ({ ask }) => ({ command: askDictation(ask) }),
  },
});
