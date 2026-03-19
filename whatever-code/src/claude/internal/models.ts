import { Effect } from "effect";
import { claudeSessionSqliteEntity } from "../../db/claude.js";
import { UpdateSessionParams } from "../schema.js";

export const makeModelOperations = () => {
  const updateSession = (params: typeof UpdateSessionParams.Type) =>
    claudeSessionSqliteEntity
      .update({ id: params.sessionId }, params.updates)
      .pipe(Effect.orDie);

  return { updateSession };
};
