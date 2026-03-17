import { Effect } from "effect";
import { v7 } from "uuid";
import { ulid } from "ulid";
import {
  claudeMessageSqliteEntity,
  claudeSessionSqliteEntity,
  claudeTurnSqliteEntity,
} from "../../db/claude.js";
import { QueryParams } from "../schema.js";
import type { InitSession } from "./init-session.js";
import { makeUserMessage } from "./helpers.js";

export const createSession =
  (initSession: InitSession) => (params: typeof QueryParams.Type) =>
    Effect.gen(function* () {
      const sessionId = v7();
      const turnId = ulid();
      const userMessage = makeUserMessage(sessionId, params.prompt);

      yield* Effect.all([
        claudeSessionSqliteEntity.insert({
          id: sessionId,
          status: "in_progress",
          absolutePath: params.cwd,
          name: params.prompt.slice(0, 80),
        }),
        claudeTurnSqliteEntity.insert({
          id: turnId,
          sessionId,
          status: "in_progress",
          init: null,
          result: null,
        }),
        claudeMessageSqliteEntity.insert({
          id: ulid(),
          sessionId,
          turnId,
          data: userMessage,
        }),
      ]).pipe(Effect.orDie);

      yield* initSession(sessionId, turnId, userMessage, {
        ...params.options,
        sessionId,
      });
      return { sessionId };
    });
