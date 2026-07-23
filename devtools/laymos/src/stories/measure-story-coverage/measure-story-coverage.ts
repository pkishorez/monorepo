import { isAbsolute, relative, resolve, sep } from 'node:path';

import { Lang, parse } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import { Effect } from 'effect';

import type {
  StoryCollection,
  StoryTrace,
  StoryTracePath,
} from '../../report/stories.js';
import type {
  StoryCoverage,
  StoryCoverageRange,
  StoryCoverageReport,
} from '../../report/story-coverage.js';
import {
  projectStorySource,
  type StoryEjectionPlan,
  type StorySourceAnchor,
  type StorySourceClassification,
  type StorySourceProjection,
  type StorySourceProjectionRange,
} from '../inspect-story-source/index.js';
import {
  decision,
  exhaustive,
  flow,
  terminal,
  when,
} from '../authoring/index.js';

interface TraversalScope {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
}

interface ClassifiedLine {
  readonly file: string;
  readonly line: number;
  readonly classification: StorySourceClassification;
  readonly reason?: string;
}

const functionKinds = [
  'arrow_function',
  'function_declaration',
  'function_expression',
  'generator_function',
  'generator_function_declaration',
  'method_definition',
] as const;

const classificationRank: Readonly<Record<StorySourceClassification, number>> =
  { unnarrated: 0, narrated: 1, omitted: 2 };

export const measureProjectStoryCoverage = flow(
  'Measure Story narration',
  {
    description:
      'Projects structural trace anchors into application source and keeps invalid Stories explicit instead of distorting coverage.',
    attributes: (
      baseDir: string,
      stories: StoryCollection,
      _ejection: StoryEjectionPlan,
    ) => ({
      baseDir,
      stories: Object.keys(stories.traces).length,
    }),
  },
  (baseDir: string, stories: StoryCollection, ejection: StoryEjectionPlan) => {
    const report = measureStoryCoverage(baseDir, stories, ejection);
    return decision(
      'Any Story trace is invalid',
      {
        description:
          'Separates structurally measurable Stories from invalid traces that must remain visible but receive no score.',
        attributes: (hasInvalidStories) => ({
          hasInvalidStories,
          invalidStories: report.invalidStories.length,
        }),
      },
      report.invalidStories.length > 0,
    ).pipe(
      when(
        false,
        {
          name: 'All measurable',
          description: 'Return coverage for every inspected Story.',
          completion: { kind: 'success' },
        },
        () =>
          terminal(
            'Narration measurement is complete',
            {
              description:
                'Completes with classified source evidence for every Story.',
              completion: { kind: 'success' },
            },
            () => Effect.succeed(report),
          ),
      ),
      when(
        true,
        {
          name: 'Invalid traces excluded',
          description:
            'Return valid coverage alongside exact invalid Story messages.',
          completion: { kind: 'success' },
        },
        () =>
          terminal(
            'Partial narration measurement is complete',
            {
              description:
                'Completes without assigning misleading coverage to structurally invalid Stories.',
              completion: { kind: 'success' },
            },
            () => Effect.succeed(report),
          ),
      ),
      exhaustive,
    );
  },
);

/** Measures narration only within application functions traversed by each Story. */
export function measureStoryCoverage(
  baseDir: string,
  stories: StoryCollection,
  ejection: StoryEjectionPlan,
): StoryCoverageReport {
  const rewrites = new Map(
    ejection.rewrites.map((rewrite) => [rewrite.path, rewrite]),
  );
  const catalog = new Map(
    stories.catalog.modules
      .flatMap((module) => module.stories)
      .map((story) => [story.storyPath, story]),
  );
  const invalidStories: Array<{ storyPath: string; message: string }> = [];
  const coverage: StoryCoverage[] = [];

  for (const [storyPath, trace] of Object.entries(stories.traces).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (trace.status === 'invalid') {
      invalidStories.push({ storyPath, message: trace.message });
      continue;
    }
    coverage.push(
      projectTraceCoverage(
        baseDir,
        storyPath,
        catalog.get(storyPath)?.name ?? storyPath,
        trace,
        rewrites,
      ),
    );
  }

  return {
    invalidStories,
    stories: coverage,
  };
}

function projectTraceCoverage(
  baseDir: string,
  storyPath: string,
  name: string,
  trace: StoryTrace,
  rewrites: ReadonlyMap<string, StoryEjectionPlan['rewrites'][number]>,
): StoryCoverage {
  const anchorsByFile = new Map<string, Map<string, StorySourceAnchor>>();
  const blockIds = new Set<string>();
  const visitedDefinitions = new Set<string>();
  collectTraceAnchors(
    baseDir,
    trace.execution,
    trace,
    anchorsByFile,
    blockIds,
    visitedDefinitions,
  );
  for (const blockId of blockIds) {
    const block = trace.blocks[blockId];
    if (block === undefined) {
      throw new Error(`Story trace references unknown Block ${blockId}`);
    }
    addAnchor(anchorsByFile, block.location.file, {
      id: blockId,
      line: block.location.line,
      column: block.location.column,
      classification: 'narrated',
    });
  }

  const unresolvedFiles = [...anchorsByFile.keys()].filter(
    (file) => !rewrites.has(file) && !/\.story\.[cm]?[jt]sx?$/.test(file),
  );
  if (unresolvedFiles.length > 0) {
    throw new Error(
      `Story Blocks resolve outside ejectable application source: ${unresolvedFiles.sort().join(', ')}`,
    );
  }

  const lineClassifications = new Map<string, ClassifiedLine>();
  const scopes = new Map<string, TraversalScope>();
  const files = new Set<string>();

  for (const [file, anchorsByLocation] of anchorsByFile) {
    const rewrite = rewrites.get(file);
    if (rewrite === undefined) continue;
    const anchors = [...anchorsByLocation.values()].sort(compareAnchors);
    const projection = projectStorySource(
      rewrite.before,
      file,
      anchors,
    ).ejected;
    assertResolvedAnchors(file, anchors, projection.ranges);
    const fileScopes = traversalScopes(file, projection);
    if (fileScopes.length === 0) continue;
    files.add(file);
    for (const scope of fileScopes) {
      scopes.set(`${file}:${scope.start}:${scope.end}`, scope);
    }
    classifyScopeLines(file, projection, fileScopes, lineClassifications);
  }

  const counts = { narrated: 0, omitted: 0, unnarrated: 0 };
  for (const line of lineClassifications.values()) {
    counts[line.classification] += 1;
  }
  const totalLines = counts.narrated + counts.omitted + counts.unnarrated;
  const percentages = coveragePercentages(counts, totalLines);
  const classifiedLines = [...lineClassifications.values()].sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );

  return {
    storyPath,
    name,
    files: [...files].sort(),
    functions: [...scopes.values()].map(scopeRange),
    omissions: lineRanges(
      classifiedLines.filter(
        ({ classification }) => classification === 'omitted',
      ),
    ),
    unnarratedRegions: lineRanges(
      classifiedLines.filter(
        ({ classification }) => classification === 'unnarrated',
      ),
    ),
    totalLines,
    narrated: {
      lines: counts.narrated,
      percentage: percentages.narrated,
    },
    omitted: {
      lines: counts.omitted,
      percentage: percentages.omitted,
    },
    unnarrated: {
      lines: counts.unnarrated,
      percentage: percentages.unnarrated,
    },
  };
}

function traversalScopes(
  file: string,
  projection: StorySourceProjection,
): readonly TraversalScope[] {
  const root = parse(languageFor(file), projection.content).root();
  const functions = functionKinds.flatMap((kind) =>
    root.findAll({ rule: { kind: kind as never } }),
  );
  const scopes = new Map<string, TraversalScope>();
  for (const range of projection.ranges) {
    if (range.classification === 'unnarrated') continue;
    const owner = smallestContainingFunction(functions, range);
    if (owner === undefined) {
      throw new Error(
        `${file}:${range.startLine}: narrated source is not inside a named application function`,
      );
    }
    const body = field(owner, 'body');
    if (body === null) {
      throw new Error(
        `${file}:${range.startLine}: application function has no source body`,
      );
    }
    const bodyRange = body.range();
    const start = sourcePosition(projection.content, bodyRange.start.index);
    const end = sourcePosition(projection.content, bodyRange.end.index);
    const scope = {
      file,
      start: bodyRange.start.index,
      end: bodyRange.end.index,
      startLine: start.line,
      endLine: end.line,
    };
    scopes.set(`${scope.start}:${scope.end}`, scope);
  }
  return [...scopes.values()].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}

function smallestContainingFunction(
  functions: readonly SgNode[],
  source: StorySourceProjectionRange,
): SgNode | undefined {
  return functions
    .filter((candidate) => {
      const range = candidate.range();
      return (
        isApplicationCallable(candidate) &&
        range.start.index <= source.start &&
        range.end.index >= source.end
      );
    })
    .sort(
      (left, right) =>
        left.range().end.index -
        left.range().start.index -
        (right.range().end.index - right.range().start.index),
    )[0];
}

function isApplicationCallable(node: SgNode): boolean {
  if (
    node.kind() === 'function_declaration' ||
    node.kind() === 'generator_function_declaration' ||
    node.kind() === 'method_definition'
  ) {
    return true;
  }
  let value = node;
  let parent = value.parent();
  while (
    parent !== null &&
    (parent.kind() === 'parenthesized_expression' ||
      parent.kind() === 'as_expression' ||
      parent.kind() === 'satisfies_expression')
  ) {
    value = parent;
    parent = value.parent();
  }
  if (parent === null) return false;
  if (parent.kind() === 'variable_declarator') {
    return (
      field(parent, 'value')?.id() === value.id() &&
      field(parent, 'name')?.kind() === 'identifier'
    );
  }
  if (parent.kind() === 'public_field_definition') {
    return field(parent, 'value')?.id() === value.id();
  }
  if (parent.kind() === 'pair') {
    return field(parent, 'value')?.id() === value.id();
  }
  if (parent.kind() === 'assignment_expression') {
    return field(parent, 'right')?.id() === value.id();
  }
  return false;
}

function classifyScopeLines(
  file: string,
  projection: StorySourceProjection,
  scopes: readonly TraversalScope[],
  classifications: Map<string, ClassifiedLine>,
): void {
  const lines = sourceLines(projection.content);
  for (const scope of scopes) {
    for (const line of lines) {
      if (line.end <= scope.start || line.start >= scope.end) continue;
      const start = Math.max(line.start, scope.start);
      const end = Math.min(line.end, scope.end);
      if (projection.content.slice(start, end).trim() === '') continue;
      const strongest = strongestClassification(
        projection.ranges.filter(
          (range) => range.end > start && range.start < end,
        ),
      );
      const key = `${file}:${line.number}`;
      const existing = classifications.get(key);
      if (
        existing === undefined ||
        classificationRank[strongest.classification] >
          classificationRank[existing.classification]
      ) {
        classifications.set(key, {
          file,
          line: line.number,
          classification: strongest.classification,
          ...(strongest.reason === undefined
            ? {}
            : { reason: strongest.reason }),
        });
      }
    }
  }
}

function sourceLines(source: string): readonly {
  readonly number: number;
  readonly start: number;
  readonly end: number;
}[] {
  const lines: Array<{ number: number; start: number; end: number }> = [];
  let start = 0;
  let number = 1;
  for (let index = 0; index <= source.length; index += 1) {
    if (index < source.length && source[index] !== '\n') continue;
    lines.push({ number, start, end: index });
    start = index + 1;
    number += 1;
  }
  return lines;
}

function sourcePosition(
  source: string,
  index: number,
): { readonly line: number; readonly column: number } {
  const lines = source.slice(0, index).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

function strongestClassification(
  ranges: readonly StorySourceProjectionRange[],
): Pick<StorySourceProjectionRange, 'classification' | 'reason'> {
  let strongest: Pick<StorySourceProjectionRange, 'classification' | 'reason'> =
    { classification: 'unnarrated' };
  for (const range of ranges) {
    if (
      classificationRank[range.classification] >
      classificationRank[strongest.classification]
    ) {
      strongest = range;
    }
  }
  return strongest;
}

function coveragePercentages(
  counts: Readonly<Record<StorySourceClassification, number>>,
  total: number,
): Readonly<Record<StorySourceClassification, number>> {
  if (total === 0) {
    return { narrated: 0, omitted: 0, unnarrated: 0 };
  }
  const narrated = Math.round((counts.narrated / total) * 1000) / 10;
  const omitted = Math.round((counts.omitted / total) * 1000) / 10;
  return {
    narrated,
    omitted,
    unnarrated: Math.round((100 - narrated - omitted) * 10) / 10,
  };
}

function scopeRange(scope: TraversalScope): StoryCoverageRange {
  return {
    file: scope.file,
    startLine: scope.startLine,
    endLine: scope.endLine,
  };
}

function lineRanges(lines: readonly ClassifiedLine[]): StoryCoverageRange[] {
  const ranges: StoryCoverageRange[] = [];
  for (const line of lines) {
    const previous = ranges.at(-1);
    if (
      previous !== undefined &&
      previous.file === line.file &&
      previous.endLine + 1 === line.line &&
      previous.reason === line.reason
    ) {
      ranges[ranges.length - 1] = { ...previous, endLine: line.line };
      continue;
    }
    ranges.push({
      file: line.file,
      startLine: line.line,
      endLine: line.line,
      ...(line.reason === undefined ? {} : { reason: line.reason }),
    });
  }
  return ranges;
}

function collectTraceAnchors(
  baseDir: string,
  path: StoryTracePath,
  trace: StoryTrace,
  anchorsByFile: Map<string, Map<string, StorySourceAnchor>>,
  blockIds: Set<string>,
  visitedDefinitions: Set<string>,
): void {
  for (const item of path) {
    switch (item.kind) {
      case 'omission': {
        const file = normalizeProjectFile(baseDir, item.location.file);
        if (file === undefined) {
          throw new Error(
            `Omission source location is outside the project: ${item.location.file}:${item.location.line}:${item.location.column}`,
          );
        }
        addAnchor(anchorsByFile, file, {
          id: `${file}:${item.location.line}:${item.location.column}:omission`,
          line: item.location.line,
          column: item.location.column,
          classification: 'omitted',
          reason: item.reason,
        });
        break;
      }
      case 'flow':
        blockIds.add(item.blockId);
        collectTraceAnchors(
          baseDir,
          item.children,
          trace,
          anchorsByFile,
          blockIds,
          visitedDefinitions,
        );
        break;
      case 'decision':
        blockIds.add(item.blockId);
        if (item.selector !== undefined) {
          collectTraceAnchors(
            baseDir,
            item.selector,
            trace,
            anchorsByFile,
            blockIds,
            visitedDefinitions,
          );
        }
        for (const arm of item.arms) {
          collectTraceAnchors(
            baseDir,
            arm.children,
            trace,
            anchorsByFile,
            blockIds,
            visitedDefinitions,
          );
        }
        break;
      case 'all':
        for (const branch of item.branches) {
          collectTraceAnchors(
            baseDir,
            branch,
            trace,
            anchorsByFile,
            blockIds,
            visitedDefinitions,
          );
        }
        break;
      case 'for-each':
        collectTraceAnchors(
          baseDir,
          item.body,
          trace,
          anchorsByFile,
          blockIds,
          visitedDefinitions,
        );
        break;
      case 'flow-reference': {
        blockIds.add(item.blockId);
        if (visitedDefinitions.has(item.blockId)) break;
        visitedDefinitions.add(item.blockId);
        const definition = trace.definitions[item.blockId];
        if (definition !== undefined) {
          collectTraceAnchors(
            baseDir,
            definition,
            trace,
            anchorsByFile,
            blockIds,
            visitedDefinitions,
          );
        }
        break;
      }
      case 'step':
      case 'terminal':
        blockIds.add(item.blockId);
        break;
    }
  }
}

function normalizeProjectFile(
  baseDir: string,
  file: string,
): string | undefined {
  if (file === '<unknown>') return undefined;
  const root = resolve(baseDir);
  const absolute = isAbsolute(file) ? resolve(file) : resolve(root, file);
  const projectPath = relative(root, absolute);
  if (
    projectPath === '' ||
    projectPath === '..' ||
    projectPath.startsWith(`..${sep}`) ||
    isAbsolute(projectPath)
  ) {
    return undefined;
  }
  return projectPath.split(sep).join('/');
}

function addAnchor(
  anchorsByFile: Map<string, Map<string, StorySourceAnchor>>,
  file: string,
  anchor: StorySourceAnchor,
): void {
  if (anchor.line <= 0 || anchor.column <= 0) return;
  const anchors = anchorsByFile.get(file) ?? new Map();
  const key = `${anchor.line}:${anchor.column}:${anchor.classification}`;
  if (!anchors.has(key)) anchors.set(key, anchor);
  anchorsByFile.set(file, anchors);
}

function compareAnchors(
  left: StorySourceAnchor,
  right: StorySourceAnchor,
): number {
  return left.line - right.line || left.column - right.column;
}

function assertResolvedAnchors(
  file: string,
  anchors: readonly StorySourceAnchor[],
  ranges: readonly StorySourceProjectionRange[],
): void {
  const resolved = new Set(
    ranges
      .filter(({ classification }) => classification !== 'unnarrated')
      .map(({ id }) => id),
  );
  const missing = anchors.filter(({ id }) => !resolved.has(id));
  if (missing.length === 0) return;
  throw new Error(
    `${file}: Story source locations no longer match ${missing.map(({ line, column }) => `${line}:${column}`).join(', ')}`,
  );
}

function languageFor(fileName: string): Lang {
  return /\.(?:tsx|jsx)$/.test(fileName) ? Lang.Tsx : Lang.TypeScript;
}

function field(node: SgNode, name: string): SgNode | null {
  return (node as SgNode & { field(name: string): SgNode | null }).field(name);
}
