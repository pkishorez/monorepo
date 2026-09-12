import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

const SendMessage = Rpc.make('SendMessage', {
  payload: {
    id: Schema.String,
    author: Schema.String,
    text: Schema.String,
  },
  success: Schema.Struct({ id: Schema.String }),
});

export const Messages = RpcGroup.make(SendMessage);

/** Nostr relays shared by every demo Peer, so browser and Node Peers find each other. */
export const signaling = {
  relays: ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'],
  namespace: 'effect-webrtc-demo',
} as const;

export const rtc = {
  iceServers: [
    {
      urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'],
    },
  ],
} as const;

export const isPeerIdentifier = (value: string) =>
  /^[a-z0-9_-]{1,64}$/.test(value);
