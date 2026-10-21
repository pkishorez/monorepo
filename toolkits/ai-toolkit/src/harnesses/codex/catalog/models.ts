import { tmpdir } from 'node:os';
import { Duration, Effect } from 'effect';
import {
  HarnessError,
  type AvailableModel,
  type HarnessBinaries,
} from '../../../harness/index.js';
import { start, type AppServer, type Model } from '../app-server/index.js';

/**
 * The model new sessions use when the account cannot be asked: what Codex
 * 0.154's `model/list` marked `isDefault` on a ChatGPT account.
 */
export const DEFAULT_MODEL = 'gpt-6-astra';

/** Variants that are not chat-and-tools coding models Codex can drive. */
const NOT_FOR_CODEX =
  /(?:^|-)(?:pro|chat|image|realtime|audio|tts|transcribe|search|embedding)(?:-|$)/;

/**
 * Whether Codex runs a models.dev `openai` model: the GPT-5 generation and
 * later, codex variants included. Older GPTs, o-series, image, embedding,
 * realtime and pro models are not Codex models.
 */
export const acceptsModel = (modelId: string): boolean => {
  const generation = /^gpt-(\d+)(?:\.\d+)?(?:-|$)/.exec(modelId);
  if (generation === null) return false;
  return Number(generation[1]) >= 5 && !NOT_FOR_CODEX.test(modelId);
};

/** Every visible model the server's login can run, page by page. */
export const listModels = (
  server: AppServer,
): Effect.Effect<ReadonlyArray<AvailableModel>, HarnessError> =>
  Effect.gen(function* () {
    const models: Array<AvailableModel> = [];
    let cursor: string | null = null;
    do {
      const page: {
        readonly data: ReadonlyArray<Model>;
        readonly nextCursor: string | null;
      } = yield* server.request('model/list', {
        includeHidden: false,
        ...(cursor === null ? {} : { cursor }),
      });
      for (const model of page.data)
        if (!model.hidden)
          models.push({
            id: model.id,
            name: model.displayName,
            isDefault: model.isDefault,
          });
      cursor = page.nextCursor;
    } while (cursor !== null);
    return models;
  });

const ASK_TIMEOUT = Duration.seconds(15);

/** Asks a short-lived `codex app-server` which models this login can run. */
export const availableModels: Effect.Effect<
  ReadonlyArray<AvailableModel>,
  HarnessError,
  HarnessBinaries
> = Effect.gen(function* () {
  const server = yield* start(tmpdir());
  return yield* listModels(server);
}).pipe(
  Effect.scoped,
  Effect.timeoutOrElse({
    duration: ASK_TIMEOUT,
    orElse: () =>
      Effect.fail(
        new HarnessError({ message: 'Codex took too long to list its models' }),
      ),
  }),
);
