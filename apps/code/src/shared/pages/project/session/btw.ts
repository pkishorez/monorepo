/*
 * `/btw` asks the session a question on the side instead of sending a
 * message: the rest of the line on is the question. Only at the very start,
 * as the composer's `/` menu inserts it.
 */

const BTW = /^\/btw(?:\s+([\s\S]*))?$/;

/** The question a draft asks with `/btw`, `''` when it names none, or null when it is a message. */
export const btwQuestion = (draft: string): string | null => {
  const match = BTW.exec(draft.trim());
  return match === null ? null : (match[1] ?? '').trim();
};
