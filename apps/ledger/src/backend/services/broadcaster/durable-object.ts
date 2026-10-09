import { defaultBroadcaster } from '@kstackz/std-toolkit/core';

/** What hears every write in a User's Durable Object: the object itself,
 * which every socket of theirs, on every device, is connected to. */
export const broadcasterDurableObject = defaultBroadcaster;
