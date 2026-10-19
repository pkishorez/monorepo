import type { NewCredential } from '../../shared/contracts/credential/index.ts';

/*
 * Where a submitted form's keys wait for the one Command that sends them.
 * Messages are kept in the app's History, which can be saved and replayed,
 * so a Message carries only a handle; the keys stay here, in this tab's
 * memory, and leave the moment the Command takes them.
 */

const held = new Map<string, NewCredential>();

/** Keeps `input` until it is taken; answers its handle. */
export const holdKeys = (input: NewCredential): string => {
  const handle = crypto.randomUUID();
  held.set(handle, input);
  return handle;
};

/** The input held under `handle`, once: null if it was taken or dropped. */
export const takeKeys = (handle: string): NewCredential | null => {
  const input = held.get(handle) ?? null;
  held.delete(handle);
  return input;
};
