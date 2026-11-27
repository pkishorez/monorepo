import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Ask, Voice } from './voice.ts';
import { askDictation } from './commands.ts';
import { Dictation } from './dictation/index.ts';
import { Microphone } from './microphone/index.ts';

/*
 * Voice: recording from anywhere, a Child of the header, which is drawn
 * around every page, so it carries on while the user moves between pages,
 * Settings too. Its Children record from the page's microphone,
 * `Recorder` (`recorder/`), which the page's root Layer gives.
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
  message: {
    DictationAsked: Schema.Struct({ ask: Ask }).annotate({
      description:
        "Asks the Dictation: Toggle starts or stops one for owner {key, connectionId}, key 'draft <connectionId> <projectId> <sessionId|new>' or 'question <connectionId> <questionId> <itemId>'; Cancel throws it away; Retry a failed one's id.",
    }),
  },
});

export const VoiceLive = Spoken.build({
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
