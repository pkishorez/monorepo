import { Effect, Layer, Stream } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { layer as weriftPlatform } from 'effect-webrtc/platform/werift';
import { layer as nostrSignaling } from 'effect-webrtc/signaling/nostr';
import { Messages, rtc, signaling } from '../contract/index.ts';
import type { Transcript } from './transcript.ts';

/** Nostr signaling and werift RTC, matching the browser Peer's network. */
export const nodeNetwork = Layer.mergeAll(
  nostrSignaling(signaling),
  weriftPlatform,
);

/** Starts the local Peer; incoming Messages go straight to the Transcript. */
export const startPeer = (localId: string, transcript: Transcript) =>
  WebRtc.make({
    id: PeerId.make(localId),
    rtc,
    serve: {
      contract: Messages,
      handlers: Messages.toLayer({
        SendMessage: ({ author, id, text }) =>
          transcript.received(author, text).pipe(Effect.as({ id })),
      }),
    },
  });

type Peer = Effect.Success<ReturnType<typeof startPeer>>;
type Remote = Effect.Success<ReturnType<Peer['connect']>>;

/** Prints every status change of the Peer Session with `remoteId`. */
export const reportSession = (
  peer: Peer,
  remoteId: string,
  transcript: Transcript,
) =>
  peer.sessions.pipe(
    Stream.map((sessions) =>
      sessions.find((session) => String(session.remoteId) === remoteId),
    ),
    Stream.filter((session) => session !== undefined),
    Stream.changes,
    Stream.switchMap((session) => session.status),
    Stream.runForEach(transcript.status),
  );

/** Sends one Message; a dropped connection is reported, not thrown. */
export const sendMessage = (
  remote: Remote,
  author: string,
  text: string,
  transcript: Transcript,
) =>
  Effect.suspend(() =>
    remote.rpc.SendMessage({ id: crypto.randomUUID(), author, text }),
  ).pipe(
    Effect.asVoid,
    Effect.catchCause(() => transcript.failed(text)),
  );
