import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ResolvedConfig, ViteBuilder } from 'vite';
import { computeBuildId, MANIFEST_URL } from '../../shared/build/index.js';
import {
  type ResolvedPwaConfig,
  workerConfigOf,
} from '../../shared/config/index.js';
import {
  manifestIconUrls,
  withManifestDefaults,
} from '../../shared/manifest/index.js';
import type { BuildState } from './build-state.js';
import { mergeHeaders } from './headers.js';
import { bundleFiles, overlay, readTree } from './output-files.js';
import { selectAssets, selectDocuments } from '../precache/index.js';
import {
  assertAfterStart,
  missingDocumentsMessage,
  subfolderIndexMessage,
} from './start-setup.js';
import { workerScript } from '../worker-bundle/index.js';

const NAME = 'pwa-toolkit:build';

const writeOutput = async (path: string, content: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const readOptional = (path: string): Promise<string | null> =>
  readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

/**
 * The production pipeline. In the client environment's `generateBundle`:
 * emit the manifest, pick the non-HTML Precache entries and compute the
 * Build ID. In a post `buildApp` hook, after every environment and Start's
 * prerender: add the App Shell and Offline Fallback, write the worker (or
 * the Kill Switch) to the client outDir, and merge `_headers`.
 */
export const buildPlugin = (
  config: ResolvedPwaConfig,
  state: BuildState,
): Plugin => {
  let vite: ResolvedConfig;

  const writeWorker = async (builder: ViteBuilder) => {
    const environments = Object.values(builder.environments);
    // Without a builder that builds them (a plain Vite app), Vite builds
    // every environment after the post hooks; do it now, as Vite would.
    if (environments.every((environment) => !environment.isBuilt)) {
      for (const environment of environments) await builder.build(environment);
    }
    const client = builder.environments['client'];
    if (!client) throw new Error('pwa-toolkit: no client environment');
    const outDir = resolve(client.config.root, client.config.build.outDir);
    const script = config.enabled
      ? await workerScript({
          killSwitch: false,
          info: await finalBuildInfo(outDir),
          root: client.config.root,
          worker: config.worker,
          mode: vite.mode,
          alias: vite.resolve.alias,
          minify: client.config.build.minify !== false,
        })
      : await workerScript({ killSwitch: true });
    await writeOutput(join(outDir, config.swUrl), script);
    const headersPath = join(outDir, '_headers');
    const noCache = config.manifest
      ? [config.swUrl, MANIFEST_URL]
      : [config.swUrl];
    await writeOutput(
      headersPath,
      mergeHeaders(await readOptional(headersPath), noCache),
    );
  };

  const finalBuildInfo = async (outDir: string) => {
    const { assets, buildId } = state;
    if (!assets || !buildId) {
      throw new Error(
        'pwa-toolkit: the client environment produced no Build ID',
      );
    }
    const { navigation } = config;
    const documents = selectDocuments(await readTree(outDir), [
      ...(navigation.shell ? [navigation.shellPath] : []),
      navigation.offlineFallback,
    ]);
    if (documents.missing.length > 0) {
      vite.logger.warn(missingDocumentsMessage(navigation, documents.missing));
    }
    if (documents.subfolderIndex.length > 0) {
      vite.logger.warn(subfolderIndexMessage(documents.subfolderIndex));
    }
    const bytes = assets.bytes + documents.bytes;
    if (bytes > config.precache.warnAboveBytes) {
      vite.logger.warn(
        `pwa-toolkit: the Precache is ${(bytes / 1024 / 1024).toFixed(1)} MiB; every install downloads all of it. Narrow it with precache.exclude.`,
      );
    }
    return {
      buildId,
      precache: [...assets.entries, ...documents.entries],
      config: workerConfigOf(config),
    };
  };

  return {
    name: NAME,
    apply: 'build',
    enforce: 'post',
    sharedDuringBuild: true,
    configResolved(resolved) {
      vite = resolved;
      assertAfterStart(resolved.plugins, NAME);
    },
    async generateBundle(_options, bundle) {
      if (this.environment.name !== 'client') return;
      if (config.manifest) {
        this.emitFile({
          type: 'asset',
          fileName: MANIFEST_URL.slice(1),
          source: `${JSON.stringify(withManifestDefaults(config.manifest), null, 2)}\n`,
        });
      }
      if (!config.enabled) return;
      const env = this.environment.config;
      const publicFiles =
        env.publicDir && env.build.copyPublicDir
          ? await readTree(env.publicDir)
          : [];
      const assets = selectAssets(overlay(publicFiles, bundleFiles(bundle)), {
        ...config.precache,
        iconUrls: config.manifest ? manifestIconUrls(config.manifest) : [],
        base: env.base,
      });
      for (const url of assets.missingIcons) {
        this.warn(`manifest icon ${url} is not in the build output`);
      }
      state.assets = assets;
      state.buildId = computeBuildId({
        precache: assets.entries,
        config: workerConfigOf(config),
      });
    },
    buildApp: { order: 'post', handler: writeWorker },
  };
};
