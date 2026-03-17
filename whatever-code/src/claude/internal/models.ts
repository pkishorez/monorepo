import {
  query as sdkQuery,
  type ModelInfo,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect } from "effect";
import { ClaudeChatError } from "../../api/definitions/claude.js";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { UpdateModelParams } from "../schema.js";

const fetchModels = async () => {
  const ac = new AbortController();
  async function* emptyPrompt() {}
  const tempQuery = sdkQuery({
    prompt: emptyPrompt(),
    options: { abortController: ac },
  });
  try {
    return await tempQuery.supportedModels();
  } finally {
    ac.abort();
  }
};

export const makeModelOperations = () => {
  let cachedModels: ModelInfo[] | undefined;

  const updateModel = (params: typeof UpdateModelParams.Type) =>
    claudeSessionSqliteEntity
      .update({ id: params.sessionId }, { model: params.model })
      .pipe(Effect.orDie);

  const getModels = () =>
    Effect.gen(function* () {
      if (cachedModels) return cachedModels;
      const models = yield* Effect.tryPromise({
        try: () => fetchModels(),
        catch: (e) => new ClaudeChatError({ message: String(e) }),
      });
      cachedModels = models;
      return models;
    });

  return { updateModel, getModels };
};
