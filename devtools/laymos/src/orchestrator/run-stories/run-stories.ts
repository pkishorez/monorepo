import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Cause, Effect, Exit, Stream } from 'effect';
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
import { extractSnippets } from './extract-snippets.js';
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

export function runStories(
  configPath: string,
  options?: { readonly scope?: string | undefined },
): Stream.Stream<StoryReport, ConfigError | StoriesError> {
  const scope = options?.scope;
  return Stream.fromArrayEffect(
    Effect.flatMap(loadRoot(configPath), ({ stories }) => {
      if (scope === undefined) return Effect.succeed(stories);
      const scoped = stories.filter(
        ({ id }) => id === scope || id.startsWith(`${scope}/`),
      );
      if (scoped.length === 0) {
        return Effect.fail(
          new StoriesError({
            reason: 'unknown-scope',
            path: scope,
            cause: null,
          }),
        );
      }
      return Effect.succeed(scoped);
    }),
  ).pipe(Stream.mapEffect(runStory));
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
    const entryPoint = join(
      dirname(absoluteConfigPath),
      config.storiesPath,
      'index.ts',
    );
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
    return yield* indexGroup(root, [root.title], entryPoint, {
      projectRoot: dirname(absoluteConfigPath),
    });
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
  );
}

function indexGroup(
  group: StoryGroup,
  path: readonly string[],
  entryPoint: string,
  options: { readonly projectRoot: string },
): Effect.Effect<
  { tree: StoryTreeGroup; stories: readonly IndexedStory[] },
  StoriesError
> {
  return Effect.gen(function* () {
    yield* checkUniqueTitles(group.children, path, entryPoint);
    const groups: StoryTreeGroup[] = [];
    const leaves: StoryLeaf[] = [];
    const stories: IndexedStory[] = [];
    for (const child of group.children) {
      const id = [...path, child.title].join('/');
      if (isStory(child)) {
        const source = yield* loadStorySource(child, options.projectRoot);
        const snippets = extractSnippets(source.path, source.content);
        const questions = yield* indexQuestions(child, source, snippets);
        leaves.push({
          id,
          title: child.title,
          setup: snippets.setup,
          questions,
          source,
        });
        stories.push({ id, story: child });
      } else {
        const indexed = yield* indexGroup(
          child,
          [...path, child.title],
          entryPoint,
          options,
        );
        groups.push(indexed.tree);
        stories.push(...indexed.stories);
      }
    }
    return {
      tree: { title: group.title, groups, stories: leaves },
      stories,
    };
  });
}

function indexQuestions(
  story: Story,
  source: StorySource,
  snippets: ReturnType<typeof extractSnippets>,
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

function toJsonValue(value: unknown, seen = new Set<object>()): JsonValue {
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
  if (seen.has(object)) return '[circular]';
  seen.add(object);
  if (Array.isArray(object)) {
    return object.map((item) => toJsonValue(item, seen));
  }
  if (object instanceof Date) return object.toISOString();
  if (object instanceof Map) {
    return [...object.entries()].map(([key, item]) => [
      toJsonValue(key, seen),
      toJsonValue(item, seen),
    ]);
  }
  if (object instanceof Set) {
    return [...object.values()].map((item) => toJsonValue(item, seen));
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, toJsonValue(item, seen)]),
  );
}
