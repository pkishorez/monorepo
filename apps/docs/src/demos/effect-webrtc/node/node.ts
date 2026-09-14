import { Effect, References } from 'effect';
import { PeerId } from 'effect-webrtc';
import { Command } from 'effect/unstable/cli';
import { nodeNetwork, reportSession, sendMessage, startPeer } from './peer.ts';
import { identity, readLines } from './prompt.ts';
import { makeTranscript } from './transcript.ts';

const chat = Command.make('effect-webrtc-node', identity, ({ name, remote }) =>
  Effect.gen(function* () {
    const transcript = yield* makeTranscript;
    if (name === remote) {
      return yield* transcript.note('Pick a different Peer to connect to');
    }

    const peer = yield* startPeer(name, transcript);
    yield* reportSession(peer, remote, transcript).pipe(Effect.forkScoped);
    yield* transcript.note(`Waiting for ${remote} as ${name}…`);

    const remotePeer = yield* peer.connect({ id: PeerId.make(remote) });
    yield* Effect.addFinalizer(() =>
      peer.disconnect(PeerId.make(remote)).pipe(Effect.ignore),
    );
    yield* transcript.note('Type a Message and press Enter. Ctrl+C quits.');

    yield* readLines((text) =>
      text.length === 0 || text.length > 500
        ? Effect.void
        : sendMessage(remotePeer, name, text, transcript),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(nodeNetwork),
    // Connection Attempt Flows log at INFO; keep the chat readable.
    Effect.provideService(References.MinimumLogLevel, 'Warn'),
  ),
).pipe(
  Command.withDescription(
    'Connects one Node Peer to a browser Peer and exchanges Messages',
  ),
);

/** Runs the Node Peer CLI with arguments from the process. */
export const runNodePeer = Command.run(chat, { version: '0.0.0' });
