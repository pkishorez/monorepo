import { Effect } from "effect";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { UpdateModelParams, UpdateModeParams } from "../schema.js";

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
  const updateModel = (params: typeof UpdateModelParams.Type) =>
    claudeSessionSqliteEntity
      .update({ id: params.sessionId }, { model: params.model })
      .pipe(Effect.orDie);

  const getModels = () => Effect.succeed(MODELS);

  const updateMode = (params: typeof UpdateModeParams.Type) =>
    claudeSessionSqliteEntity
      .update({ id: params.sessionId }, { permissionMode: params.permissionMode })
      .pipe(Effect.orDie);

  return { updateModel, updateMode, getModels };
};
