import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Layer } from 'effect';
import { Harnesses, Models, type Titler } from '@kestack/ai-toolkit/harness';
import { sherpa, Speech, type SpeechToText } from '@kestack/ai-toolkit/speech';
import { CodeApi } from './api/index.js';
import { Engine, storedHarnessBinaries } from './engine/index.js';
import { Store } from './engine/services/store/index.js';
import { CodeApiLive } from './handlers.js';

/*
 * The code App Group: what a Machine serves for Code. The Store on its
 * SQLite file, the engine over it and the harnesses, Attachments, Folders
 * under the home folder, the models each harness runs, Speech to Text, and
 * the API's handlers over them. Whoever serves it says where each file
 * goes; left out, they sit beside the database. When the Machine's socket
 * closes, the engine stops every turn, and the Store closes last.
 */

export interface CodeGroupOptions {
  /** The SQLite file. */
  readonly db: string;
  /** Where Attachments that are not images are saved; beside the database unless given. */
  readonly attachments?: string;
  /** The models.dev copy; `models.json` beside the database unless given. */
  readonly modelsCache?: string;
  /** Where the Speech to Text model is kept; `speech-to-text/` beside the database unless given. */
  readonly speechFolder?: string;
  readonly harnesses: Layer.Layer<Harnesses | Titler>;
  /** Speech to Text; sherpa-onnx with Parakeet unless given. */
  readonly speech?: Layer.Layer<SpeechToText>;
  /** The folder `listFolder` and `createFolder` never leave; the user's home unless given. */
  readonly home?: string;
}

/** The code App Group: `CodeApi`, and the Layer of its handlers. */
export const codeGroup = (options: CodeGroupOptions) => {
  const beside = (name: string) => join(dirname(options.db), name);
  const base = Layer.merge(Store.layer(options.db), options.harnesses);
  const engine = Engine.layer({
    attachments: options.attachments ?? beside('attachments'),
    home: options.home ?? homedir(),
  }).pipe(Layer.provide(base));
  const models = Models.layer({
    cacheFile: options.modelsCache ?? beside('models.json'),
  }).pipe(Layer.provide(storedHarnessBinaries), Layer.provide(base));
  const speech = Speech.layer({
    folder: options.speechFolder ?? beside('speech-to-text'),
  }).pipe(Layer.provide(options.speech ?? sherpa()));
  const layer = CodeApiLive.pipe(
    Layer.provide(Layer.mergeAll(base, engine, models, speech)),
  );
  return { api: CodeApi, layer };
};
