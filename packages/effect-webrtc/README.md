# effect-webrtc

Effect-native, one-to-one peer sessions carrying Effect RPC over WebRTC data channels.

`WebRtc.make` composes a Signaling Layer and a host WebRTC Platform Layer. The package includes deterministic in-memory adapters for tests and local development.

Connection attempts and individual RPC invocations produce causally ordered, payload-redacted Effect Tracer Flows with stable Peer swim lanes.
