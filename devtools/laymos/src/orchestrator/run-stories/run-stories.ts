import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Cause, Effect, Stream } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { tsImport } from 'tsx/esm/api';

import {
  isStory,
  isStoryDoc,
  isStoryGroup,
  StoryContext,
  type Story,
  type StoryGroup,
} from '../../story/index.js';
import type {
  StoryDocLeaf,
  StoryLeaf,
  StoryReport,
  StorySection,
  StorySource,
  StoryTree,
  StoryTreeGroup,
} from '../../story/schema/index.js';
import type { ConfigError } from '../../services/config/index.js';
import {
  ConfigService,
  ConfigServiceLive,
} from '../../services/config/index.js';
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
    const docs: StoryDocLeaf[] = [];
    const groups: StoryTreeGroup[] = [];
    const leaves: StoryLeaf[] = [];
    const stories: IndexedStory[] = [];
    for (const child of group.children) {
      const id = [...path, child.title].join('/');
      if (isStory(child)) {
        const source = yield* loadStorySource(child, options.projectRoot);
        leaves.push({
          id,
          title: child.title,
          description: child.description,
          markdown: child.markdown,
          ...(source === undefined ? {} : { source }),
        });
        stories.push({ id, story: child });
      } else if (isStoryDoc(child)) {
        docs.push({
          id,
          title: child.title,
          description: child.description,
          markdown: child.markdown,
        });
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
      tree: { ...groupDocs(group), docs, groups, stories: leaves },
      stories,
    };
  });
}

function loadStorySource(
  story: Story,
  projectRoot: string,
): Effect.Effect<StorySource | undefined, StoriesError> {
  if (story.sourceUrl === undefined) return Effect.succeed(undefined);
  return Effect.try({
    try: () => {
      const filePath = fileURLToPath(story.sourceUrl!);
      return {
        path: relative(projectRoot, filePath),
        content: readFileSync(filePath, 'utf8'),
      };
    },
    catch: (cause) =>
      new StoriesError({ reason: 'load', path: story.sourceUrl!, cause }),
  });
}

function groupDocs(group: StoryGroup) {
  return {
    title: group.title,
    description: group.description,
    markdown: group.markdown,
  };
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

interface MutableSection {
  section: StorySection;
}

function runStory({ id, story }: IndexedStory): Effect.Effect<StoryReport> {
  return Effect.gen(function* () {
    const sections: MutableSection[] = [];
    const exit = yield* story.run.pipe(
      Effect.provideService(StoryContext, {
        beginSection: (section) =>
          Effect.sync(() => {
            sections.push({ section: { ...section, assertions: [] } });
          }),
        assert: (description, passed) =>
          Effect.sync(() => {
            const current = sections.at(-1) ?? {
              section: { kind: 'exec', description: 'checks', assertions: [] },
            };
            if (!sections.includes(current)) sections.push(current);
            current.section = {
              ...current.section,
              assertions: [
                ...current.section.assertions,
                { description, passed },
              ],
            };
          }),
      }),
      Effect.exit,
    );

    const collected = sections.map(({ section }) => section);
    if (exit._tag === 'Failure') {
      return {
        id,
        verdict: 'errored',
        sections: collected,
        error: Cause.pretty(exit.cause),
      } satisfies StoryReport;
    }

    const failed = collected.some((section) =>
      section.assertions.some((assertion) => !assertion.passed),
    );
    return {
      id,
      verdict: failed ? 'failed' : 'passed',
      sections: collected,
    } satisfies StoryReport;
  });
}
