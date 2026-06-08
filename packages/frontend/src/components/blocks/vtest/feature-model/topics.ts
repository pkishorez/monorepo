import type { VtestDirective, VtestFeature, VtestGroup } from '../types';

/** One revealable topic of a feature's documentation. */
export interface FeatureTopic {
  /** Stable id (heading slug or index). */
  readonly id: string;
  /** Title shown in the in-page table of contents. */
  readonly title: string;
  /** The topic's markdown body (heading excluded; rendered on reveal). */
  readonly markdown: string;
  /** Groups whose directive falls within this topic, in document order. */
  readonly groups: readonly VtestGroup[];
}

/** The overview shown before the table of contents (intro prose, no heading). */
export interface FeatureOverview {
  readonly markdown: string;
}

interface Split {
  readonly overview: FeatureOverview;
  readonly topics: readonly FeatureTopic[];
}

/**
 * A directive marker line (e.g. `::test-group{id=slot}`) anchors a test group
 * in the prose; it is consumed for placement and must not render as text.
 */
const DIRECTIVE_LINE = /^[ \t]*::[\w-]+(?:\{[^}]*\})?[ \t]*$/gm;

/** Remove directive marker lines, collapsing the blank gap they leave behind. */
function stripDirectives(markdown: string): string {
  return markdown
    .replace(DIRECTIVE_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slug(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : `topic-${index}`;
}

/**
 * Splits a feature's markdown into an overview plus one topic per top-level
 * (`#`/`##`) heading, attaching the test groups whose directive offset falls
 * inside each topic's character range. This drives the feature page's
 * one-topic-at-a-time reveal.
 */
export function splitFeature(feature: VtestFeature): Split {
  const { markdown, directives, groups } = feature;
  const groupById = new Map(groups.map((g) => [g.id, g] as const));

  const lines = markdown.split('\n');
  const headingRe = /^#{1,2}\s+(.+)$/;

  interface Section {
    title: string;
    start: number;
    bodyStart: number;
    end: number;
  }

  const sections: Section[] = [];
  let offset = 0;
  let current: Section | null = null;
  let overviewEnd = markdown.length;

  for (const line of lines) {
    const lineLen = line.length + 1;
    const match = headingRe.exec(line);
    if (match) {
      if (current) current.end = offset;
      else overviewEnd = offset;
      current = {
        title: match[1]!.trim(),
        start: offset,
        bodyStart: offset + lineLen,
        end: markdown.length,
      };
      sections.push(current);
    }
    offset += lineLen;
  }

  const groupsFor = (start: number, end: number): VtestGroup[] =>
    directives
      .filter((d: VtestDirective) => d.offset >= start && d.offset < end)
      .map((d) => groupById.get(d.id))
      .filter((g): g is VtestGroup => g !== undefined);

  const topics: FeatureTopic[] = sections.map((s, i) => ({
    id: slug(s.title, i),
    title: s.title,
    markdown: stripDirectives(markdown.slice(s.bodyStart, s.end)),
    groups: groupsFor(s.start, s.end),
  }));

  return {
    overview: { markdown: stripDirectives(markdown.slice(0, overviewEnd)) },
    topics,
  };
}
