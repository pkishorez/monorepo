/*
 * Whether a Session is drawn Unseen, from this device's marks for its
 * Machine (Preferences).
 */

/** Whether a Session is Unseen: its last Turn ended after the mark this device keeps for it, among its Machine's marks. */
export const isUnseen = (
  unseen: Readonly<Record<string, number>>,
  sessionId: string,
  lastEnded: number | null,
) => {
  const seen = unseen[sessionId];
  return seen !== undefined && lastEnded !== null && lastEnded > seen;
};
