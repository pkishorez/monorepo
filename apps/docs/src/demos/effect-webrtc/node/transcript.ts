import { Effect, Terminal } from 'effect';
import type { SessionStatus } from 'effect-webrtc';

const describeStatus = (status: SessionStatus) => {
  if (status._tag === 'Connected') return 'Connected';
  const phase = status.phase?.replaceAll('-', ' ') ?? 'waiting';
  return `${status._tag}: ${phase}`;
};

/** Prints the Conversation to the terminal: status, notes, and Messages. */
export const makeTranscript = Effect.gen(function* () {
  const terminal = yield* Terminal.Terminal;
  const print = (text: string) =>
    terminal.display(`${text}\n`).pipe(Effect.ignore);
  return {
    note: (text: string) => print(`· ${text}`),
    status: (status: SessionStatus) => print(`· ${describeStatus(status)}`),
    received: (author: string, text: string) => print(`${author}: ${text}`),
    failed: (text: string) => print(`✗ not delivered: ${text}`),
  };
});

export type Transcript = Effect.Success<typeof makeTranscript>;
