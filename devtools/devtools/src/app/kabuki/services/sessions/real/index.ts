import { Effect, Layer, Stream } from 'effect';
import { dialSessions, remote } from '@kestack/devtools-kabuki/devtools';
import { Sessions } from '../contract/index.js';

export const sessionsLayer = (origin: string) =>
  Layer.succeed(Sessions)({
    watch: Stream.unwrap(
      Effect.map(dialSessions(origin), (client) => client.watch()),
    ),
    session: (name) => remote(origin, name),
  });
