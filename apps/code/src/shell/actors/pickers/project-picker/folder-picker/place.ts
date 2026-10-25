import { Schema } from 'effect';
import { HOME } from './path.ts';

/*
 * Where a folder Step is, as its key: a Machine, and a folder under that
 * Machine's home (`path.ts`). A Picker keys a Step by one string, so the
 * two are written as one JSON pair.
 */

const Place = Schema.fromJsonString(
  Schema.Tuple([Schema.String, Schema.String]),
);
const encode = Schema.encodeSync(Place);
const decode = Schema.decodeUnknownSync(Place);

/** The key of the folder `path` on a Machine. */
export const keyAt = (machineId: string, path: string) =>
  encode([machineId, path]);

/** The Machine and the folder a key names. */
export const placeOf = (key: string) => {
  const [machineId, path] = decode(key);
  return { machineId, path };
};

/** The key of a Machine's home folder. */
export const homeOf = (machineId: string) => keyAt(machineId, HOME);
