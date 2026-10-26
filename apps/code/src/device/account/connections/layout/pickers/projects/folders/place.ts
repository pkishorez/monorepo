import { Schema } from 'effect';
import { HOME } from './path.ts';

/*
 * Where a folder Step is, as its key: a Connection, and a folder under that
 * Connection's home (`path.ts`). A Picker keys a Step by one string, so the
 * two are written as one JSON pair.
 */

const Place = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String]),
);
const encode = Schema.encodeSync(Place);
const decode = Schema.decodeUnknownSync(Place);

/** The key of the folder `path` on a Connection. */
export const keyAt = (connectionId: string, path: string) =>
  encode([connectionId, path]);

/** The Connection and the folder a key names. */
export const placeOf = (key: string) => {
  const [connectionId, path] = decode(key);
  return { connectionId, path };
};

/** The key of a Connection's home folder. */
export const homeOf = (connectionId: string) => keyAt(connectionId, HOME);
