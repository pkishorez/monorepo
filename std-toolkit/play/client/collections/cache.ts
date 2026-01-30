import { IDBCache } from "@std-toolkit/cache/idb";
import { Effect } from "effect";

export const cache = await Effect.runPromise(IDBCache.open());
