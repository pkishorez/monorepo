# effect-webrtc

Effect-native peer sessions and RPC over WebRTC data channels

## Big picture

WebRTC gives two endpoints a direct data channel, but the application still has to pick a signaling service, run offer and answer negotiation, notice when a connection dies, and start again. This Package hides that behind one `Peer` value. You declare which remote Peer you want, the Package keeps a Peer Session with it, and you call the remote's Effect RPC contract as ordinary Effects.

Two Services are pluggable. `Signaling` carries negotiation messages between Peers and comes in memory, Nostr, and Durable (authenticated Cloudflare Durable Object) flavours. `WebRtcPlatform` supplies the host WebRTC implementation and comes in memory, browser, and werift (Node) flavours. Tests and stories run entirely in memory with no networking.

RPC uses `effect/unstable/rpc` directly over the data channel. Connection attempts and RPC invocations are traced as Flows from `@pkishorez/flow`, so a Flow viewer shows one swim lane per Peer. The Durable Signaling Provider authenticates with `auth-toolkit` and deploys with `rpc-toolkit`'s Alchemy Durable RPC worker.

Vocabulary lives in [CONTEXT.md](./CONTEXT.md). Design decisions live in [docs/adr/](./docs/adr/). The demos in `apps/docs/src/demos/effect-webrtc` and `apps/docs/src/demos/durable-webrtc` show a browser Peer chatting with a Node Peer and with other Peers of the same user.

## Install

```sh
pnpm add effect-webrtc
```

Peer dependencies:

- `effect`: every export is an Effect, Layer, Service, or Schema built on Effect 4.
- `alchemy` (optional): needed only for `effect-webrtc/signaling/durable/alchemy`, which defines the Cloudflare worker as an Alchemy resource.

## Exports

### `effect-webrtc`

| Export           | What it does                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `WebRtc`         | Namespace object holding the Peer constructor.                                                                                         |
| `WebRtc.make`    | Creates a scoped Peer that connects to, waits for, and serves RPC to remote Peers using the provided `Signaling` and `WebRtcPlatform`. |
| `PeerId`         | Branded string Schema for Peer Identifiers, with `PeerId.make` to build one.                                                           |
| `generatePeerId` | Returns a fresh random UUID Peer Identifier.                                                                                           |
| `WebRtcError`    | Error raised when making a Peer, connecting, finding a remote Peer, or disconnecting fails.                                            |

### `effect-webrtc/signaling`

| Export                | What it does                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `Signaling`           | Service tag for a Signaling Provider that opens one scoped connection per local Peer.              |
| `PeerId`              | The same Peer Identifier Schema as the root export.                                                |
| `NegotiationMessage`  | Schema union of the offer, answer, ICE candidate, and close messages exchanged during negotiation. |
| `NegotiationEnvelope` | Schema wrapping a `NegotiationMessage` with its session and attempt identifiers and Flow carrier.  |
| `PeerIdInUse`         | Error when a provider already has a connection open for that Peer Identifier.                      |
| `PeerUnavailable`     | Error when a message is addressed to a Peer the provider cannot reach.                             |
| `SignalingError`      | Error for a failed open, receive, or send on the signaling connection.                             |

### `effect-webrtc/signaling/memory`

| Export  | What it does                                                                                  |
| ------- | --------------------------------------------------------------------------------------------- |
| `layer` | Layer for a process-local `Signaling` that routes messages between Peers in the same process. |

### `effect-webrtc/signaling/nostr`

| Export  | What it does                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `layer` | Builds a `Signaling` Layer that publishes ephemeral plaintext events to the given Nostr relays under an optional namespace. |

### `effect-webrtc/signaling/durable`

| Export                     | What it does                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`                  | Opens one authenticated WebSocket to a Durable Signaling worker and returns the Peer Directory stream, a `waitForPeer` Effect, and a ready `Signaling` Layer. |
| `DurableSignaling`         | Namespace object holding `connect`.                                                                                                                           |
| `DurableSignaling.connect` | Same as `connect`.                                                                                                                                            |

### `effect-webrtc/signaling/durable/rpc`

| Export                 | What it does                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DurableSignalingRpcs` | RpcGroup shared by the browser client and the worker: subscribe to peers, wait for a peer, receive negotiations, send a negotiation, and read a debug counter. |
| `PeerMode`             | Schema of the two Peer modes, `Connectable` and `Private`.                                                                                                     |
| `PeerDescriptor`       | Schema of a directory entry: Peer Identifier, Peer Name, and mode.                                                                                             |
| `ConnectionMetadata`   | Alias of `PeerDescriptor`, the values a client sends when it connects.                                                                                         |
| `IncomingNegotiation`  | Schema of a received negotiation: the sender and its envelope.                                                                                                 |
| `TooManyPeerWaits`     | Tagged error when a connection has too many pending Peer Waits.                                                                                                |
| `NegotiationTooLarge`  | Tagged error when a negotiation envelope exceeds the size limit.                                                                                               |

### `effect-webrtc/signaling/durable/worker`

| Export                       | What it does                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `durableSignalingConnection` | Builds the connection slot that checks the request origin, verifies the session against the auth worker, decodes Peer metadata, and replaces an older socket for the same Peer. |
| `durableSignalingHandlers`   | Effect that builds the `DurableSignalingRpcs` handlers keeping one in-memory Peer Directory per user inside the Durable Object.                                                 |

### `effect-webrtc/signaling/durable/alchemy`

| Export                   | What it does                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `DurableSignalingWorker` | Defines an Alchemy Cloudflare worker class that serves `DurableSignalingRpcs` from one hibernating Durable Object. |

### `effect-webrtc/platform`

| Export           | What it does                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `WebRtcPlatform` | Service tag for the host WebRTC implementation that creates RTC Connections.             |
| `RtcError`       | Error for a failed RTC operation such as creating an offer or sending on a data channel. |

### `effect-webrtc/platform/memory`

| Export  | What it does                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------- |
| `layer` | Layer for a process-local `WebRtcPlatform` that pairs connections by offer token and does no networking. |

### `effect-webrtc/platform/werift`

| Export  | What it does                                                                  |
| ------- | ----------------------------------------------------------------------------- |
| `layer` | Layer for a `WebRtcPlatform` backed by werift's `RTCPeerConnection` for Node. |

### `effect-webrtc/platform/browser`

| Export  | What it does                                                                     |
| ------- | -------------------------------------------------------------------------------- |
| `layer` | Layer for a `WebRtcPlatform` backed by the browser's native `RTCPeerConnection`. |

### `effect-webrtc/rpc`

| Export | What it does                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| `make` | Opens the RPC Transport over one RTC Data Channel, with heartbeats, close handshake, and per-invocation Flow tracing. |

## Usage

### Two Peers exchange RPC in memory

Bob serves an RPC contract. Alice connects and calls it. The memory Layers make this run in a test with no network.

```ts
import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { PeerId, WebRtc } from 'effect-webrtc';
import { layer as memoryPlatform } from 'effect-webrtc/platform/memory';
import { layer as memorySignaling } from 'effect-webrtc/signaling/memory';

const Greet = Rpc.make('Greet', {
  payload: { name: Schema.String },
  success: Schema.String,
});
const Api = RpcGroup.make(Greet);

const program = Effect.scoped(
  Effect.gen(function* () {
    yield* WebRtc.make({
      id: PeerId.make('bob'),
      serve: {
        contract: Api,
        handlers: Api.toLayer({
          Greet: ({ name }) => Effect.succeed(`Hello, ${name}`),
        }),
      },
    });
    const alice = yield* WebRtc.make({ id: PeerId.make('alice') });
    const bob = yield* alice.connect({
      id: PeerId.make('bob'),
      contract: Api,
    });
    return yield* bob.rpc.Greet({ name: 'Ada' });
  }),
).pipe(Effect.provide(Layer.merge(memorySignaling, memoryPlatform)));

const result = await Effect.runPromise(program); // 'Hello, Ada'
```

- `WebRtc.make` with `serve` makes Bob an RPC Provider; without it Alice is only a consumer.
- `connect` starts a Peer Session and resolves once the data channel is open.
- Passing `contract` to `connect` types `bob.rpc`; omit it to reuse `serve.contract`.
- Closing the scope disconnects every session and releases both Peers.

### A Node Peer over Nostr and werift

Lifted from the docs demo. A Node process reaches a browser Peer through public Nostr relays and STUN, and prints incoming Messages.

```ts
import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { PeerId, WebRtc } from 'effect-webrtc';
import { layer as weriftPlatform } from 'effect-webrtc/platform/werift';
import { layer as nostrSignaling } from 'effect-webrtc/signaling/nostr';

const SendMessage = Rpc.make('SendMessage', {
  payload: { id: Schema.String, author: Schema.String, text: Schema.String },
  success: Schema.Struct({ id: Schema.String }),
});
const Messages = RpcGroup.make(SendMessage);

const nodeNetwork = Layer.mergeAll(
  nostrSignaling({
    relays: ['wss://relay.damus.io', 'wss://nos.lol'],
    namespace: 'effect-webrtc-demo',
  }),
  weriftPlatform,
);

const chat = Effect.gen(function* () {
  const peer = yield* WebRtc.make({
    id: PeerId.make('node'),
    rtc: { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] },
    serve: {
      contract: Messages,
      handlers: Messages.toLayer({
        SendMessage: ({ author, id, text }) =>
          Effect.log(`${author}: ${text}`).pipe(Effect.as({ id })),
      }),
    },
  });
  const browser = yield* peer.connect({ id: PeerId.make('browser') });
  yield* browser.rpc.SendMessage({
    id: crypto.randomUUID(),
    author: 'node',
    text: 'Hello from Node',
  });
}).pipe(Effect.scoped, Effect.provide(nodeNetwork));
```

- Both Peers must use the same relays and namespace to find each other.
- `rtc.iceServers` is passed to every RTC Connection; without it only host candidates are offered and cross-network connects usually fail.
- Both sides serve `Messages`, so either Peer can call the other over one session.
- If the data channel drops, the Peer Session stays and renegotiates on its own.

### Authenticated signaling with a Durable Object

Deploy one worker beside an `auth-toolkit` worker, then connect a browser Peer to it. Only Peers of the same signed-in user see each other.

```ts
// worker.ts
import { DurableSignalingWorker } from 'effect-webrtc/signaling/durable/alchemy';

export default class SignalingWorker extends DurableSignalingWorker<SignalingWorker>()(
  'DurableSignalingWorker',
  {
    main: import.meta.filename,
    authWorkerUrl: 'https://auth.example.com',
    trustedOrigins: ['https://app.example.com'],
  },
) {}
```

```ts
// browser.ts
import { Effect, Stream } from 'effect';
import { generatePeerId, PeerId, WebRtc } from 'effect-webrtc';
import { layer as browserPlatform } from 'effect-webrtc/platform/browser';
import { DurableSignaling } from 'effect-webrtc/signaling/durable';

const program = Effect.gen(function* () {
  const durable = yield* DurableSignaling.connect({
    url: 'wss://signaling.example.com',
    peerId: generatePeerId(),
    name: 'My laptop',
    mode: 'Connectable',
  });
  const peer = yield* WebRtc.make({ id: durable.peerId }).pipe(
    Effect.provide(durable.signalingLayer),
  );
  yield* durable.peers.pipe(
    Stream.runForEach((peers) => Effect.log('Peer Directory', peers)),
    Effect.forkScoped,
  );
  const other = yield* durable.waitForPeer(PeerId.make('my-phone'));
  yield* peer.connect({ id: other.peerId });
}).pipe(Effect.scoped, Effect.provide(browserPlatform));
```

- The worker verifies the browser session against `authWorkerUrl` and rejects untrusted origins.
- `connect` sends the Peer Identifier, Peer Name, and mode as query parameters and returns a `Signaling` Layer bound to that socket.
- `peers` emits the user's Peer Directory now and after every join or leave.
- `Connectable` Peers accept inbound sessions; `Private` Peers only initiate.
