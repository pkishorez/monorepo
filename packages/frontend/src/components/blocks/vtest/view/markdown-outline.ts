import type { VtestDirective } from '../types';

/** A heading parsed out of a feature's markdown, for the right-hand outline. */
export interface OutlineHeading {
  /** Heading depth (1–6). */
  readonly depth: number;
  /** Rendered heading text. */
  readonly text: string;
  /** Slug id (matches the anchor `Markdown`/rehype would generate). */
  readonly id: string;
}

/** A prose chunk or a directive marker, in document order. */
export type FeatureSegment =
  | { readonly kind: 'prose'; readonly source: string }
  | { readonly kind: 'group'; readonly id: string };

/**
 * Split a feature's markdown at its directive offsets into an ordered list of
 * prose segments interleaved with group markers, so the reader can render the
 * inline test-group cards exactly where their `::test-group` directive sits.
 */
export function splitAtDirectives(
  markdown: string,
  directives: readonly VtestDirective[],
): FeatureSegment[] {
  const sorted = [...directives].sort((a, b) => a.offset - b.offset);
  const segments: FeatureSegment[] = [];
  let cursor = 0;

  for (const directive of sorted) {
    const offset = clamp(directive.offset, cursor, markdown.length);
    const prose = stripDirectiveLine(markdown.slice(cursor, offset));
    if (prose.trim().length > 0)
      segments.push({ kind: 'prose', source: prose });
    segments.push({ kind: 'group', id: directive.id });
    cursor = skipDirectiveLine(markdown, offset);
  }

  const tail = markdown.slice(cursor);
  if (tail.trim().length > 0) segments.push({ kind: 'prose', source: tail });
  return segments;
}

/** Parse ATX (`#`) headings out of markdown for the "On this page" outline. */
export function parseHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const depth = match[1].length;
    const text = match[2].trim();
    if (text.length === 0) continue;
    headings.push({ depth, text, id: slugify(text) });
  }

  return headings;
}

/** Slugify heading text into a GitHub-style anchor id. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Drop a trailing `::test-group{...}` line left at the end of a prose chunk. */
function stripDirectiveLine(chunk: string): string {
  return chunk.replace(/(^|\n)::test-group\{[^}]*\}[^\n]*$/, '$1');
}

/** Advance past the directive's own line so it isn't rendered as prose. */
function skipDirectiveLine(markdown: string, offset: number): number {
  const next = markdown.indexOf('\n', offset);
  return next === -1 ? markdown.length : next + 1;
}
