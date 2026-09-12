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
