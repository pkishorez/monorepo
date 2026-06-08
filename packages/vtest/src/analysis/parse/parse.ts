import type { DirectiveRef } from '../model/index.js';

const DIRECTIVE = /::test-group\{\s*id\s*=\s*([^}\s]+)\s*\}/g;
const FENCE = /^(\s*)(`{3,}|~{3,})/;

/**
 * Compute the set of character offset ranges covered by fenced code blocks
 * (``` or ~~~), so directives inside them can be ignored.
 */
const fencedRanges = (md: string): ReadonlyArray<readonly [number, number]> => {
  const ranges: Array<readonly [number, number]> = [];
  const lines = md.split('\n');
  let offset = 0;
  let openFence: string | null = null;
  let openStart = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    const match = FENCE.exec(line);
    if (openFence === null) {
      if (match) {
        openFence = match[2]![0]!;
        openStart = offset;
      }
    } else if (match && match[2]![0] === openFence) {
      ranges.push([openStart, offset + lineLen]);
      openFence = null;
    }
    offset += lineLen;
  }
  if (openFence !== null) ranges.push([openStart, md.length]);
  return ranges;
};

const inRanges = (
  offset: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean => ranges.some(([start, end]) => offset >= start && offset < end);

/**
 * Find every `::test-group{id=…}` directive in a `doc.md`, returning each id
 * and its character offset. Directives inside fenced code blocks are ignored.
 */
export const parseDirectives = (
  docMarkdown: string,
): ReadonlyArray<DirectiveRef> => {
  const fenced = fencedRanges(docMarkdown);
  const out: Array<DirectiveRef> = [];
  DIRECTIVE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIRECTIVE.exec(docMarkdown)) !== null) {
    const offset = match.index;
    if (inRanges(offset, fenced)) continue;
    out.push({ id: match[1]!, offset });
  }
  return out;
};
