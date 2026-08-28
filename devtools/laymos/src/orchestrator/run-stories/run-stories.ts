import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Cause, Effect, Exit, Logger, References, Stream } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { tsImport } from 'tsx/esm/api';

import {
  isStory,
  isStoryGroup,
  StoryContext,
  type Story,
  type StoryGroup,
} from '../../story/index.js';
import type {
  JsonValue,
  QuestionLeaf,
  QuestionReport,
  QuestionSection,
  StoryAssertion,
  StoryLeaf,
  StoryPage,
  StoryReport,
  StorySource,
  StoryTree,
  StoryTreeGroup,
} from '../../story/schema/index.js';
import { slugifyQuestion } from '../../story/schema/index.js';
import type { ConfigError } from '../../services/config/index.js';
import {
  ConfigService,
  ConfigServiceLive,
} from '../../services/config/index.js';
import {
  extractSnippets,
  storySnippets,
  type StorySnippets,
} from './extract-snippets.js';
import { StoriesError } from './errors.js';

interface IndexedStory {
  readonly id: string;
  readonly story: Story;
}

export function getStoryTree(
  configPath: string,
): Effect.Effect<StoryTree, ConfigError | StoriesError> {
  return Effect.map(loadRoot(configPath), ({ tree }) => tree);
}

export interface RunStoriesOptions {
  readonly scope?: string | undefined;
  readonly concurrency?: number | undefined;
}

export interface StoriesRun {
  readonly total: number;
  readonly reports: Stream.Stream<StoryReport>;
}

const DEFAULT_CONCURRENCY = 16;

export function planStories(
  configPath: string,
  options?: RunStoriesOptions,
): Effect.Effect<StoriesRun, ConfigError | StoriesError> {
  return Effect.gen(function* () {
    const { stories } = yield* loadRoot(configPath);
    const planned = yield* scopeStories(stories, options?.scope);
    return {
      total: planned.length,
      reports: runEachStory(
        planned,
        options?.concurrency ?? DEFAULT_CONCURRENCY,
      ),
    };
  });
}

export function runStories(
  configPath: string,
  options?: RunStoriesOptions,
): Stream.Stream<StoryReport, ConfigError | StoriesError> {
  return Stream.unwrap(
    Effect.map(planStories(configPath, options), ({ reports }) => reports),
  );
}

function runEachStory(
  stories: readonly IndexedStory[],
  concurrency: number,
): Stream.Stream<StoryReport> {
  // Ordered concurrent mapping needs three slots; anything less runs one at a time.
  return Stream.fromArray(stories).pipe(
    Stream.mapEffect(runStory, concurrency >= 3 ? { concurrency } : undefined),
  );
}

function scopeStories(
  stories: readonly IndexedStory[],
  scope: string | undefined,
): Effect.Effect<readonly IndexedStory[], StoriesError> {
  if (scope === undefined) return Effect.succeed(stories);
  const scoped = stories.filter(
    ({ id }) => id === scope || id.startsWith(`${scope}/`),
  );
  if (scoped.length === 0) {
    return Effect.fail(
      new StoriesError({ reason: 'unknown-scope', path: scope, cause: null }),
    );
  }
  return Effect.succeed(scoped);
}

function loadRoot(configPath: string) {
  return Effect.gen(function* () {
    const absoluteConfigPath = resolve(configPath);
    const configService = yield* ConfigService;
    const config = yield* configService.read(absoluteConfigPath);
    if (config.storiesPath === undefined) {
      return yield* new StoriesError({
        reason: 'no-stories-path',
        path: absoluteConfigPath,
        cause: null,
      });
    }
    const storiesRoot = join(dirname(absoluteConfigPath), config.storiesPath);
    const entryPoint = join(storiesRoot, 'index.ts');
    const barrel = yield* Effect.tryPromise({
      try: () => tsImport(entryPoint, import.meta.url),
      catch: (cause) =>
        new StoriesError({ reason: 'load', path: entryPoint, cause }),
    });
    const root = (barrel as { default?: unknown }).default;
    if (!isStoryGroup(root)) {
      return yield* new StoriesError({
        reason: 'invalid-root',
        path: entryPoint,
        cause: null,
      });
    }
    const options: IndexOptions = {
      projectRoot: dirname(absoluteConfigPath),
      storiesRoot,
      supportCache: new Map(),
      groupDirectories: new Map(),
    };
    const indexed = yield* indexGroup(root, [root.title], entryPoint, options);
    return {
      ...indexed,
      tree: attachGroupPages(
        indexed.tree,
        indexed.directory,
        options.projectRoot,
        options.groupDirectories,
      ),
    };
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
  );
}

interface IndexOptions {
  readonly projectRoot: string;
  readonly storiesRoot: string;
  readonly supportCache: Map<string, StorySource | null>;
  readonly groupDirectories: Map<StoryTreeGroup, string | null>;
}

function indexGroup(
  group: StoryGroup,
  path: readonly string[],
  entryPoint: string,
  options: IndexOptions,
): Effect.Effect<IndexedGroup, StoriesError> {
  return Effect.gen(function* () {
    yield* checkUniqueTitles(group.children, path, entryPoint);
    const groups: StoryTreeGroup[] = [];
    const leaves: StoryLeaf[] = [];
    const stories: IndexedStory[] = [];
    const directories: string[] = [];
    for (const child of group.children) {
      const id = [...path, child.title].join('/');
      if (isStory(child)) {
        const source = yield* loadStorySource(child, options.projectRoot);
        const snippets = extractSnippets(source.path, source.content);
        const questions = yield* indexQuestions(
          child,
          source,
          storySnippets(snippets, child.title),
        );
        leaves.push({
          id,
          title: child.title,
          description: child.description,
          spine: child.spine,
          page: resolveStoryPage(child, options.projectRoot),
          setup: snippets.setup,
          questions,
          source,
          support: resolveSupport(child, options),
        });
        stories.push({ id, story: child });
        const directory = storyDirectory(child);
        if (directory !== null) directories.push(directory);
      } else {
        const indexed = yield* indexGroup(
          child,
          [...path, child.title],
          entryPoint,
          options,
        );
        groups.push(indexed.tree);
        options.groupDirectories.set(indexed.tree, indexed.directory);
        stories.push(...indexed.stories);
        directories.push(...indexed.directories);
      }
    }
    return {
      tree: {
        title: group.title,
        description: group.description,
        page: null,
        groups,
        stories: leaves,
      },
      stories,
      directories,
      directory: commonDirectory(directories),
    };
  });
}

interface IndexedGroup {
  readonly tree: StoryTreeGroup;
  readonly stories: readonly IndexedStory[];
  readonly directories: readonly string[];
  readonly directory: string | null;
}

function storyDirectory(story: Story): string | null {
  try {
    return dirname(fileURLToPath(story.sourceUrl));
  } catch {
    return null;
  }
}

function readPage(filePath: string, projectRoot: string): StoryPage | null {
  if (!existsSync(filePath)) return null;
  return {
    path: relative(projectRoot, filePath),
    content: readFileSync(filePath, 'utf8'),
  };
}

function resolveStoryPage(story: Story, projectRoot: string): StoryPage | null {
  let filePath: string;
  try {
    filePath = fileURLToPath(story.sourceUrl);
  } catch {
    return null;
  }
  if (!filePath.endsWith('.ts')) return null;
  return readPage(`${filePath.slice(0, -3)}.md`, projectRoot);
}

// A Story Group owns the folder its descendant Stories share, and its page sits
// there under the group's own title. Two groups can span one folder — a Learn
// and a Reference trunk over the same Stories — so the title, not `index`, is
// what keeps their pages apart.
function groupPage(
  group: StoryTreeGroup,
  directory: string | null,
  projectRoot: string,
): StoryPage | null {
  if (directory === null) return null;
  return readPage(
    join(directory, `${slugifyQuestion(group.title)}.md`),
    projectRoot,
  );
}

function attachGroupPages(
  group: StoryTreeGroup,
  directory: string | null,
  projectRoot: string,
  directoriesById: ReadonlyMap<StoryTreeGroup, string | null>,
): StoryTreeGroup {
  return {
    ...group,
    page: groupPage(group, directory, projectRoot),
    groups: group.groups.map((child) =>
      attachGroupPages(
        child,
        directoriesById.get(child) ?? null,
        projectRoot,
        directoriesById,
      ),
    ),
  };
}

function commonDirectory(directories: readonly string[]): string | null {
  const [first, ...rest] = directories;
  if (first === undefined) return null;
  let shared = first.split(sep);
  for (const directory of rest) {
    const segments = directory.split(sep);
    let index = 0;
    while (
      index < shared.length &&
      index < segments.length &&
      shared[index] === segments[index]
    ) {
      index += 1;
    }
    shared = shared.slice(0, index);
  }
  return shared.length === 0 ? null : shared.join(sep);
}

function indexQuestions(
  story: Story,
  source: StorySource,
  snippets: StorySnippets,
): Effect.Effect<readonly QuestionLeaf[], StoriesError> {
  return Effect.gen(function* () {
    const seen = new Set<string>();
    const leaves: QuestionLeaf[] = [];
    for (const [index, question] of story.questions.entries()) {
      const slug = slugifyQuestion(question.question);
      if (seen.has(slug)) {
        return yield* new StoriesError({
          reason: 'duplicate-question',
          path: source.path,
          cause: question.question,
        });
      }
      seen.add(slug);
      const snippet =
        snippets.proofs.get(question.question) ?? snippets.orderedProofs[index];
      if (snippet === undefined) {
        return yield* new StoriesError({
          reason: 'snippet-extraction',
          path: source.path,
          cause: question.question,
        });
      }
      leaves.push({
        slug,
        question: question.question,
        answer: question.answer,
        snippet,
      });
    }
    return leaves;
  });
}

function loadStorySource(
  story: Story,
  projectRoot: string,
): Effect.Effect<StorySource, StoriesError> {
  return Effect.try({
    try: () => {
      const filePath = fileURLToPath(story.sourceUrl);
      return {
        path: relative(projectRoot, filePath),
        content: readFileSync(filePath, 'utf8'),
      };
    },
    catch: (cause) =>
      new StoriesError({ reason: 'load', path: story.sourceUrl, cause }),
  });
}

const SUPPORT_FILE = 'support.ts';

function resolveSupport(
  story: Story,
  options: IndexOptions,
): StorySource | null {
  const { projectRoot, storiesRoot, supportCache } = options;
  let directory: string;
  try {
    directory = dirname(fileURLToPath(story.sourceUrl));
  } catch {
    return null;
  }
  const root = resolve(storiesRoot);
  const visited: string[] = [];
  let found: StorySource | null = null;
  while (directory === root || directory.startsWith(`${root}${sep}`)) {
    const cached = supportCache.get(directory);
    if (cached !== undefined) {
      found = cached;
      break;
    }
    visited.push(directory);
    const candidate = join(directory, SUPPORT_FILE);
    if (existsSync(candidate)) {
      found = {
        path: relative(projectRoot, candidate),
        content: readFileSync(candidate, 'utf8'),
      };
      break;
    }
    directory = dirname(directory);
  }
  for (const cachedDirectory of visited) {
    supportCache.set(cachedDirectory, found);
  }
  return found;
}

function checkUniqueTitles(
  children: StoryGroup['children'],
  path: readonly string[],
  entryPoint: string,
): Effect.Effect<void, StoriesError> {
  const seen = new Set<string>();
  for (const child of children) {
    if (seen.has(child.title)) {
      return new StoriesError({
        reason: 'duplicate-title',
        path: entryPoint,
        cause: [...path, child.title].join('/'),
      });
    }
    seen.add(child.title);
  }
  return Effect.void;
}

function runStory({ id, story }: IndexedStory): Effect.Effect<StoryReport> {
  return Effect.gen(function* () {
    const questions: QuestionReport[] = [];
    for (const question of story.questions) {
      questions.push(yield* runQuestion(question));
    }
    const verdict = questions.some(({ verdict }) => verdict === 'errored')
      ? 'errored'
      : questions.some(({ verdict }) => verdict === 'failed')
        ? 'failed'
        : 'passed';
    return { id, verdict, questions } satisfies StoryReport;
  });
}

function runQuestion(
  question: Story['questions'][number],
): Effect.Effect<QuestionReport> {
  return Effect.gen(function* () {
    const sections: QuestionSection[] = [];
    const assertions: StoryAssertion[] = [];
    const exit = yield* question.proof.pipe(
      Effect.provideService(StoryContext, {
        beginSection: (section) =>
          Effect.sync(() => {
            sections.push(section);
          }),
        assert: (description, passed) =>
          Effect.sync(() => {
            assertions.push({ description, passed });
          }),
      }),
      // A proof must see the same logging whatever host runs it: a Story
      // that captures its own logs cannot depend on the host's log level.
      Effect.provideService(References.MinimumLogLevel, 'Info'),
      Effect.provide(Logger.layer([])),
      Effect.exit,
    );
    const slug = slugifyQuestion(question.question);
    if (Exit.isFailure(exit)) {
      return {
        slug,
        verdict: 'errored',
        error: Cause.pretty(exit.cause),
        assertions,
        sections,
      } satisfies QuestionReport;
    }
    const failed = assertions.some((assertion) => !assertion.passed);
    return {
      slug,
      verdict: failed ? 'failed' : 'passed',
      result: toJsonValue(exit.value),
      assertions,
      sections,
    } satisfies QuestionReport;
  });
}

function toJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
    case 'function':
    case 'symbol':
      return String(value);
  }
  const object = value as object;
  if (ancestors.has(object)) return '[circular]';
  ancestors.add(object);
  const json = toJsonObject(object, ancestors);
  ancestors.delete(object);
  return json;
}

function toJsonObject(object: object, ancestors: Set<object>): JsonValue {
  if (Array.isArray(object)) {
    return object.map((item) => toJsonValue(item, ancestors));
  }
  if (object instanceof Date) return object.toISOString();
  if (object instanceof Map) {
    return [...object.entries()].map(([key, item]) => [
      toJsonValue(key, ancestors),
      toJsonValue(item, ancestors),
    ]);
  }
  if (object instanceof Set) {
    return [...object.values()].map((item) => toJsonValue(item, ancestors));
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [
      key,
      toJsonValue(item, ancestors),
    ]),
  );
}
