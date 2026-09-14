import { makeLayer } from '../browser-compatible.js';

/** Native browser WebRTC Platform. */
export const layer = makeLayer(() => {
  if (typeof globalThis.RTCPeerConnection !== 'function') {
    throw new Error('RTCPeerConnection is not available');
  }
  return globalThis.RTCPeerConnection;
});
