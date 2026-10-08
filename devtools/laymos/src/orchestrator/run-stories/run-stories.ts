import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Duration, Effect, Option, Queue, Schema, Scope, Stream } from 'effect';

import {
  ProofReportSchema,
  type ProofReport,
  type ProofRunEvent,
  type StoryTree,
  type TellingIssue,
} from '../../story/schema/index.js';
import { narrowStoryTree, storiesOf } from '../../story/story-tree/index.js';
import type { ConfigError } from '../../services/config/index.js';
import { openBrowserVenue } from './browser-venue/browser-venue.js';
import { StoriesError } from './errors.js';
import {
  findStoryFolders,
  importProofs,
  proofFilesOf,
  readStoriesConfig,
  treeOf,
  unimportedLeaf,
  type LoadedProof,
  type StoriesConfig,
} from './load-stories.js';
import { evidenceFolder, runProof, type PlannedProof } from './run-proof.js';

export interface RunStoriesOptions {
  /** A Story id (that Story and everything beneath it) or a Proof id; everything when absent. */
  readonly scope?: string | undefined;
  /** How many process Proofs run at once. Browser Proofs always run two at a time. */
  readonly concurrency?: number | undefined;
}

export interface StoriesRun {
  readonly total: number;
  /** The Story tree narrowed to the Stories and Proofs this run covers. */
  readonly tree: StoryTree;
  readonly events: Stream.Stream<ProofRunEvent>;
}

/** One Telling issue and the Story it was found in. */
export interface StoryTellingIssue {
  readonly story: string;
  readonly issue: TellingIssue;
}

const defaultConcurrency = 16;
const browserConcurrency = 2;
const defaultProcessTimeout = Duration.seconds(10);
// Browser Proofs move at a person's pace, so they take longer.
const defaultBrowserTimeout = Duration.seconds(90);

/** The Story tree; Proof files are imported for their metadata, and nothing runs. */
export function getStoryTree(
  configPath: string,
): Effect.Effect<StoryTree, ConfigError | StoriesError> {
  return Effect.map(loadStories(configPath), ({ tree }) => tree);
}

/** Every Telling issue in the tree, read without importing any Proof file. */
export function findTellingIssues(
  configPath: string,
): Effect.Effect<readonly StoryTellingIssue[], ConfigError | StoriesError> {
  return Effect.gen(function* () {
    const config = yield* readStoriesConfig(configPath);
    const folders = yield* findStoryFolders(config);
    const tree = treeOf(config, folders, (file) =>
      unimportedLeaf(config, file),
    );
    return storiesOf(tree).flatMap(({ id, issues }) =>
      issues.map((issue) => ({ story: id, issue })),
    );
  });
}

export function planStories(
  configPath: string,
  options?: RunStoriesOptions,
): Effect.Effect<StoriesRun, ConfigError | StoriesError> {
  return Effect.gen(function* () {
    const { config, proofs, tree } = yield* loadStories(configPath);
    const processTimeout = yield* configTimeout(config);
    const scope = options?.scope;
    const scopedTree =
      scope === undefined || scope === '' ? tree : narrowStoryTree(tree, scope);
    if (scopedTree === null) {
      return yield* new StoriesError({
        reason: 'unknown-scope',
        path: scope ?? '',
        cause: null,
      });
    }
    const covered = new Set(
      storiesOf(scopedTree).flatMap(({ proofs }) => proofs.map(({ id }) => id)),
    );
    const scoped = proofs.filter(({ file }) => covered.has(file.id));
    const planned = scoped.map(({ file, proof }): PlannedProof => ({
      id: file.id,
      proof,
      projectRoot: config.projectRoot,
      timeout:
        proof.timeout ??
        Duration.toMillis(
          proof.venue === 'browser' ? defaultBrowserTimeout : processTimeout,
        ),
    }));
    const browserFiles = scoped
      .filter(({ proof }) => proof.venue === 'browser')
      .map(({ file }) => file);
    return {
      total: planned.length,
      tree: scopedTree,
      events: runEach(
        planned,
        options?.concurrency ?? defaultConcurrency,
        openBrowserVenue(config.projectRoot, browserFiles),
      ),
    };
  });
}

export function runStories(
  configPath: string,
  options?: RunStoriesOptions,
): Stream.Stream<ProofRunEvent, ConfigError | StoriesError> {
  return Stream.unwrap(
    Effect.map(planStories(configPath, options), ({ events }) => events),
  );
}

/** Every saved Proof report whose Proof is still in the tree. */
export function loadStoryReports(
  configPath: string,
): Effect.Effect<readonly ProofReport[], ConfigError | StoriesError> {
  return Effect.gen(function* () {
    const config = yield* readStoriesConfig(configPath);
    const files = proofFilesOf(yield* findStoryFolders(config));
    const reports = yield* Effect.forEach(
      files,
      ({ id }) =>
        Effect.promise(() =>
          readFile(
            join(evidenceFolder(config.projectRoot, id), 'report.json'),
            'utf8',
          ).then(
            (text) =>
              Option.filter(decodeReport(text), (saved) => saved.id === id),
            () => Option.none<ProofReport>(),
          ),
        ),
      { concurrency: 16 },
    );
    return reports.flatMap((report) => Option.toArray(report));
  });
}

/** A report that no longer decodes, such as one from an older schema, is no report. */
const decodeReport = Schema.decodeUnknownOption(
  Schema.fromJsonString(ProofReportSchema),
);

function loadStories(configPath: string) {
  return Effect.gen(function* () {
    const config = yield* readStoriesConfig(configPath);
    const folders = yield* findStoryFolders(config);
    const proofs: readonly LoadedProof[] = yield* importProofs(
      config,
      proofFilesOf(folders),
    );
    const leaves = new Map(proofs.map(({ file, leaf }) => [file.id, leaf]));
    const tree = treeOf(config, folders, (file) => leaves.get(file.id)!);
    return { config, proofs, tree };
  });
}

function configTimeout(
  config: StoriesConfig,
): Effect.Effect<Duration.Duration, StoriesError> {
  if (config.storyTimeout === undefined) {
    return Effect.succeed(defaultProcessTimeout);
  }
  return Option.match(
    Duration.fromInput(config.storyTimeout as Duration.Input),
    {
      onNone: () =>
        Effect.fail(
          new StoriesError({
            reason: 'invalid-timeout',
            path: config.projectRoot,
            cause: config.storyTimeout,
          }),
        ),
      onSome: Effect.succeed,
    },
  );
}

/** Process Proofs run `concurrency` at a time; browser Proofs two at a time on one Chromium, opened on first use. */
function runEach(
  planned: readonly PlannedProof[],
  concurrency: number,
  browserVenue: ReturnType<typeof openBrowserVenue>,
): Stream.Stream<ProofRunEvent> {
  return Stream.callback<ProofRunEvent>((queue) =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const venue = yield* Effect.cached(Scope.provide(browserVenue, scope));
      const run = (proof: PlannedProof) =>
        Effect.gen(function* () {
          yield* Queue.offer(queue, { _tag: 'Started', id: proof.id });
          const report = yield* runProof(proof, venue);
          yield* Queue.offer(queue, { _tag: 'Finished', report });
        });
      yield* Effect.all(
        [
          Effect.forEach(
            planned.filter(({ proof }) => proof.venue === 'process'),
            run,
            { concurrency, discard: true },
          ),
          Effect.forEach(
            planned.filter(({ proof }) => proof.venue === 'browser'),
            run,
            { concurrency: browserConcurrency, discard: true },
          ),
        ],
        { concurrency: 2, discard: true },
      );
      yield* Queue.end(queue);
    }),
  );
}
