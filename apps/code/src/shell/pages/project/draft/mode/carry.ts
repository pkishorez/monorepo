/*
 * `/btw` at the start of a Message switches the Draft to a Side Question:
 * the rest of the text on is the question. Only at the very start, as the
 * skills Picker puts it in, or as typed into the skills Picker's search
 * that a `/` opened: `btw` and a space there.
 */

const CARRIES = /^\/btw(?:\s+([\s\S]*))?$/;

/** The question a draft asks with `/btw`, `''` when it names none, or null when it is a message. */
export const carriedQuestion = (draft: string): string | null => {
  const match = CARRIES.exec(draft.trim());
  return match === null ? null : (match[1] ?? '').trim();
};

const SEARCHED = /^btw\s([\s\S]*)$/;

/** The question a skills Picker's search asks once it is `btw` and a space, or null. */
export const searchedQuestion = (query: string): string | null =>
  SEARCHED.exec(query)?.[1] ?? null;
