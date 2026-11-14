/*
 * Markdown cut into its top-level blocks, so each is parsed and drawn on
 * its own, and text growing at its end, as it streams, parses again only
 * its last block. Joining two blocks never changes how they read, cutting
 * one may, so a cut is made only where a block surely starts: after a
 * blank line outside a fenced code block, at a line flush with the left
 * edge that cannot carry on what is above it, as a list's next item or a
 * table's next row could. Text with link references, footnotes or HTML
 * that carries on past blank lines, which reach across blocks, is not cut
 * at all.
 */

/** A line opening or closing a fenced code block: its fence. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * What reaches across blocks: a link reference or footnote definition,
 * `[name]: …`, `[^1]: …`, or HTML that carries on past blank lines, as a
 * comment or a `<pre>` does.
 */
const ACROSS = /^ {0,3}(\[[^\]\n]+\]:|<(!--|(pre|script|style|textarea)\b))/im;

/** A list's item, which may carry on a list above it. */
const ITEM = /^([-*+]|\d{1,9}[.)])(\s|$)/;

/** Whether a line flush with the left edge starts a block of its own. */
const startsBlock = (line: string) =>
  /^\S/.test(line) && !ITEM.test(line) && !line.startsWith('|');

export const blocksOf = (text: string): ReadonlyArray<string> => {
  if (ACROSS.test(text)) return [text];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let start = 0;
  let fence: string | null = null;
  let blank = false;
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]!;
    const opens = FENCE.exec(line)?.[1];
    if (fence !== null) {
      // Closed by a fence as long, of the same mark, with nothing after it.
      if (
        opens !== undefined &&
        opens[0] === fence[0] &&
        opens.length >= fence.length &&
        line.trim() === opens
      )
        fence = null;
      continue;
    }
    if (line.trim() === '') {
      blank = true;
      continue;
    }
    if (blank && at > start && startsBlock(line)) {
      blocks.push(lines.slice(start, at).join('\n'));
      start = at;
    }
    blank = false;
    if (opens !== undefined) fence = opens;
  }
  blocks.push(lines.slice(start).join('\n'));
  return blocks;
};
