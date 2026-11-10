import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import {
  claude,
  codex,
  codexOneShot,
  harnesses,
} from '@kestack/ai-toolkit/harness';
import { Plugin, PluginFolders } from '@kestack/cli-platform/plugins/plugin';
import { CodeApi } from '../api/contract/index.js';
import { codePlugin } from './serve.js';

/*
 * The code Plugin's file, as Connect runs it: the code Plugin on the socket
 * Connect gives, with Claude and Codex as the harnesses, Codex writing
 * titles. Its database and Attachments are in its data folder; the models
 * each harness runs and the Speech to Text model, which any Connection may
 * share, are in its cache folder; the Worktrees it makes are in its shared
 * folder, kept when the Connection is forgotten.
 */

Plugin.make({
  name: 'code',
  group: CodeApi,
  layer: Layer.unwrap(
    Effect.map(
      PluginFolders,
      ({ data, cache, shared }) =>
        codePlugin({
          db: join(data, 'code.db'),
          attachments: join(data, 'attachments'),
          modelsCache: join(cache, 'models.json'),
          speechFolder: join(cache, 'speech-to-text'),
          worktrees: join(shared, 'worktrees'),
          harnesses: Layer.merge(harnesses([claude, codex]), codexOneShot),
        }).layer,
    ),
  ),
})();
