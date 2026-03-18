import { Effect } from "effect";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { UpdateSessionParams } from "../schema.js";

export interface ModelOption {
  model: string;
  label: string;
}

const MODELS: ModelOption[] = [
  { model: "claude-opus-4-6", label: "Opus 4.6" },
  { model: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { model: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export const makeModelOperations = () => {
  const updateSession = (params: typeof UpdateSessionParams.Type) =>
    claudeSessionSqliteEntity
      .update({ id: params.sessionId }, params.updates)
      .pipe(Effect.orDie);

  const getModels = () => Effect.succeed(MODELS);

  return { updateSession, getModels };
};
