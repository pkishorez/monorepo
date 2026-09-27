import { Schema } from 'effect';

/** A canonical application-supplied address for one running peer. */
export const PeerId = Schema.String.pipe(
  Schema.brand('@kstackz/effect-webrtc/PeerId'),
);

export type PeerId = typeof PeerId.Type;

export const generatePeerId = (): PeerId => PeerId.make(crypto.randomUUID());
