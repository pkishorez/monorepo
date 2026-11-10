import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Layer } from 'effect';
import {
  Harnesses,
  Models,
  type OneShotPrompt,
} from '@kestack/ai-toolkit/harness';
import { sherpa, Speech, type SpeechToText } from '@kestack/ai-toolkit/speech';
import { CodeApi } from '../api/contract/index.js';
import { Engine, storeLayer } from '../engine/index.js';
import { CodeApiLive } from './handlers.js';

/*
 * The code Plugin: what a Connection runs for Code. The Store on its
 * SQLite file, the engine over it and the harnesses, Attachments, Folders
 * under the home folder, new Worktrees, the models each harness runs, Speech to Text, and
 * the API's handlers over them. Whoever serves it, main.ts on the socket
 * Connect gives, says where each file goes; left out, they sit beside the
 * database. When it stops, the engine stops every turn, and the Store
 * closes last.
 */

export interface CodePluginOptions {
  /** The SQLite file. */
  readonly db: string;
  /** Where Attachments that are not images are saved; beside the database unless given. */
  readonly attachments?: string;
  /** The models.dev copy; `models.json` beside the database unless given. */
  readonly modelsCache?: string;
  /** Where the Speech to Text model is kept; `speech-to-text/` beside the database unless given. */
  readonly speechFolder?: string;
  readonly harnesses: Layer.Layer<Harnesses | OneShotPrompt>;
  /** Speech to Text; sherpa-onnx with Parakeet unless given. */
  readonly speech?: Layer.Layer<SpeechToText>;
  /** The folder `listFolder` and `createFolder` never leave; the user's home unless given. */
  readonly home?: string;
  /** Where new Worktrees are made; `worktrees/` beside the database unless given. */
  readonly worktrees?: string;
}

/** The code Plugin: `CodeApi`, and the Layer of its handlers. */
export const codePlugin = (options: CodePluginOptions) => {
  const beside = (name: string) => join(dirname(options.db), name);
  const base = Layer.merge(storeLayer(options.db), options.harnesses);
  const engine = Engine.layer({
    attachments: options.attachments ?? beside('attachments'),
    home: options.home ?? homedir(),
    worktrees: options.worktrees ?? beside('worktrees'),
  }).pipe(Layer.provide(base));
  const models = Models.layer({
    cacheFile: options.modelsCache ?? beside('models.json'),
  });
  const speech = Speech.layer({
    folder: options.speechFolder ?? beside('speech-to-text'),
  }).pipe(Layer.provide(options.speech ?? sherpa()));
  const layer = CodeApiLive.pipe(
    Layer.provide(Layer.mergeAll(base, engine, models, speech)),
  );
  return { api: CodeApi, layer };
};
