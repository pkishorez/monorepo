import { Buffer } from 'node:buffer';
import { RTCPeerConnection } from 'werift';
import { makeLayer } from '../browser-compatible.js';

/** Werift-backed Node WebRTC Platform. */
export const layer = makeLayer(
  () => RTCPeerConnection as never,
  (payload) => Buffer.from(payload) as Uint8Array<ArrayBuffer>,
);
