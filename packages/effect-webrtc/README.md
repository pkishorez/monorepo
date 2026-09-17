# effect-webrtc

Effect-native, one-to-one peer sessions carrying Effect RPC over WebRTC data channels.

`WebRtc.make` composes a Signaling Layer and a host WebRTC Platform Layer. Use `effect-webrtc/platform/browser` for native browser WebRTC, `effect-webrtc/platform/werift` for Node, or the deterministic in-memory adapters for tests and local development.

Connection attempts and individual RPC invocations produce causally ordered, payload-redacted Effect Tracer Flows with stable Peer swim lanes. A Connection Attempt Flow also records each ICE candidate's type and address, ICE state changes, any failed negotiation step, and the candidate pairs behind a failed RTC connection.

```ts
const alice =
  yield *
  WebRtc.make({
    id: PeerId.make('alice'),
    serve: { contract: Messages, handlers: messageHandlers },
  });

const bob = yield * alice.connect({ id: PeerId.make('bob') });
yield * bob.rpc.SendMessage({ text: 'Hello' });
```

Pass `rtc: { iceServers }` to `WebRtc.make` to reach Peers on other networks. Without ICE servers each Peer only offers host candidates, and browsers such as Safari hide those behind mDNS names that cannot be resolved across cellular links, so even two Peers on one device may fail to connect.

`connect` starts a Peer Session. `getRemotePeer` finds or waits for one without starting negotiation. `getCurrentRemotePeers()` returns the available Remote Peers, and `onRemotePeer` observes each new logical Peer Session. When `contract` is omitted, these operations use `serve.contract`.

## Durable signaling

The Durable provider is an authenticated, browser-only signaling service backed by one hibernating Cloudflare Durable Object. Deploy it beside an Auth Toolkit worker:

```ts
import { DurableSignalingWorker } from 'effect-webrtc/signaling/durable/alchemy';

export default class SignalingWorker extends DurableSignalingWorker<SignalingWorker>()(
  'SignalingWorker',
  {
    main: import.meta.filename,
    authWorkerUrl: 'https://auth.example.com',
    trustedOrigins: ['https://app.example.com'],
  },
) {}
```

Then open one signaling connection for one local peer and provide its layer to `WebRtc.make`:

```ts
import { Effect, Stream } from 'effect';
import { DurableSignaling } from 'effect-webrtc/signaling/durable';

const durable =
  yield *
  DurableSignaling.connect({
    url: 'https://signaling.example.com',
    peerId: generatePeerId(),
    name: 'My laptop',
    mode: 'Connectable',
  });

const peer =
  yield *
  WebRtc.make({ id: durable.peerId }).pipe(
    Effect.provide(durable.signalingLayer),
  );

yield *
  durable.peers.pipe(
    Stream.runForEach((peers) => Effect.log('Active peers', peers)),
  );
```

`Connectable` peers accept new offers. `Private` peers appear in the same user's directory and may initiate connections, but silently ignore new inbound offers. Peers belonging to different authenticated users are never visible or routable.
The `peers` stream emits the current directory immediately and again whenever one of that user's connections joins or leaves.
