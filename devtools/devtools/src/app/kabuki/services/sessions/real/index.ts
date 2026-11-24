import { Effect, Layer, Stream } from 'effect';
import { dialSession, dialSessions } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../contract/index.js';

/** The Kabuki Sessions of the DevTools Server at `origin`. */
export const sessionsLayer = (origin: string) =>
  Layer.succeed(Sessions)({
    watch: Stream.unwrap(
      Effect.map(dialSessions(origin), (client) => client.watch()),
    ),
    dial: (name) => dialSession(origin, name),
  });
