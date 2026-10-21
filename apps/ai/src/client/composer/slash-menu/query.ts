/*
 * Whether the text just before the cursor is a slash being typed: a `/` at
 * the start of a word, then the name so far. `a/b` and `http://` are not.
 */

const typing = /(?:^|\s)\/([\w:.-]*)$/;

export function slashQuery(
  before: string,
): { readonly from: number; readonly query: string } | null {
  const match = typing.exec(before);
  if (match === null) return null;
  const query = match[1]!;
  return { from: before.length - query.length - 1, query };
}
