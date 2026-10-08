import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { register } from 'tsx/esm/api';

import { isProof, type Proof } from '../../story/index.js';
import type { ProofLeaf, StoryTree } from '../../story/schema/index.js';
import {
  buildStoryTree,
  proofIdOf,
  type StoryFolder,
} from '../../story/story-tree/index.js';
import type { ConfigError } from '../../services/config/index.js';
import {
  ConfigService,
  ConfigServiceLive,
} from '../../services/config/index.js';
import { StoriesError } from './errors.js';

export interface StoriesConfig {
  readonly projectRoot: string;
  /** The top Story's id: the Project's folder name. */
  readonly top: string;
  readonly storiesRoot: string;
  readonly storyTimeout: string | undefined;
}

export interface ProofFile {
  readonly id: string;
  /** The file name without `.proof.ts(x)`. */
  readonly name: string;
  readonly path: string;
}

/** One folder beneath the Stories path as found on disk, before any Proof is imported. */
export interface FoundFolder {
  readonly path: string;
  readonly telling: string | null;
  readonly proofs: readonly ProofFile[];
}

export interface LoadedProof {
  readonly file: ProofFile;
  readonly proof: Proof;
  readonly leaf: ProofLeaf;
}

const proofSuffix = /\.proof\.tsx?$/;
const tellingFile = 'story.md';

export function readStoriesConfig(
  configPath: string,
): Effect.Effect<StoriesConfig, ConfigError | StoriesError> {
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
    const projectRoot = dirname(absoluteConfigPath);
    return {
      projectRoot,
      top: basename(projectRoot),
      storiesRoot: join(projectRoot, config.storiesPath),
      storyTimeout: config.storyTimeout,
    };
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
  );
}

/** Every folder beneath and including the Stories path, with its Telling and Proof files. */
export function findStoryFolders(
  config: StoriesConfig,
): Effect.Effect<readonly FoundFolder[], StoriesError> {
  const visit = (
    path: string,
  ): Effect.Effect<readonly FoundFolder[], StoriesError> =>
    Effect.gen(function* () {
      const folder = join(config.storiesRoot, ...path.split('/'));
      const entries = yield* Effect.tryPromise({
        try: () => readdir(folder, { withFileTypes: true }),
        catch: (cause) =>
          new StoriesError({ reason: 'load', path: folder, cause }),
      });
      const telling = entries.some(
        (entry) => entry.isFile() && entry.name === tellingFile,
      )
        ? yield* Effect.tryPromise({
            try: () => readFile(join(folder, tellingFile), 'utf8'),
            catch: (cause) =>
              new StoriesError({ reason: 'load', path: folder, cause }),
          })
        : null;
      const proofs = entries
        .filter((entry) => entry.isFile() && proofSuffix.test(entry.name))
        .map((entry) => {
          const name = entry.name.replace(proofSuffix, '');
          return {
            id: proofIdOf(config.top, path, name),
            name,
            path: join(folder, entry.name),
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      const children = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules',
        )
        .map(({ name }) => (path === '' ? name : `${path}/${name}`))
        .sort();
      const nested = yield* Effect.forEach(children, visit);
      return [{ path, telling, proofs }, ...nested.flat()];
    });
  return visit('');
}

export function proofFilesOf(
  folders: readonly FoundFolder[],
): readonly ProofFile[] {
  return folders.flatMap(({ proofs }) => proofs);
}

/** Builds the tree from folders and the leaves known for their Proofs. */
export function treeOf(
  config: StoriesConfig,
  folders: readonly FoundFolder[],
  leafOf: (file: ProofFile) => ProofLeaf,
): StoryTree {
  return buildStoryTree(
    config.top,
    folders.map((folder): StoryFolder => ({
      path: folder.path,
      telling: folder.telling,
      proofs: folder.proofs.map((file) => {
        const { id: _id, ...leaf } = leafOf(file);
        return leaf;
      }),
    })),
  );
}

/** Imports every Proof file for its metadata; no Proof runs. */
export function importProofs(
  config: StoriesConfig,
  files: readonly ProofFile[],
): Effect.Effect<readonly LoadedProof[], StoriesError> {
  return Effect.acquireUseRelease(
    Effect.sync(() => register({ namespace: `laymos-${randomUUID()}` })),
    (loader) =>
      Effect.forEach(files, (file) =>
        Effect.gen(function* () {
          const module = yield* Effect.tryPromise({
            try: () =>
              loader.import(pathToFileURL(file.path).href, import.meta.url),
            catch: (cause) =>
              new StoriesError({ reason: 'load', path: file.path, cause }),
          });
          const proof: unknown = (module as { default?: unknown }).default;
          if (!isProof(proof)) {
            return yield* new StoriesError({
              reason: 'invalid-proof',
              path: file.path,
              cause: null,
            });
          }
          const content = yield* Effect.tryPromise({
            try: () => readFile(file.path, 'utf8'),
            catch: (cause) =>
              new StoriesError({ reason: 'load', path: file.path, cause }),
          });
          return {
            file,
            proof,
            leaf: {
              id: file.id,
              name: file.name,
              title: proof.title,
              description: proof.description,
              venue: proof.venue,
              critical: proof.critical,
              source: { path: sourcePath(config, file), content },
            },
          };
        }),
      ),
    (loader) => Effect.promise(() => loader.unregister()),
  );
}

/** What the tree shows for a Proof file that was never imported: its name only. */
export function unimportedLeaf(
  config: StoriesConfig,
  file: ProofFile,
): ProofLeaf {
  return {
    id: file.id,
    name: file.name,
    title: file.name,
    description: null,
    venue: 'process',
    critical: false,
    source: { path: sourcePath(config, file), content: '' },
  };
}

function sourcePath(config: StoriesConfig, file: ProofFile): string {
  return relative(config.projectRoot, file.path).split(sep).join('/');
}
