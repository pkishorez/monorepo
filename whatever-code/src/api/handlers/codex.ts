import { Effect } from 'effect';
import { CodexChatError, CodexRpcs } from '../definitions/codex.js';
import { CodexOrchestrator } from '../../agents/codex/codex.js';
import { codexEventSqliteEntity } from '../../db/entities/codex.js';
import { applyProjection } from '../../projection.js';

export const CodexHandlers = CodexRpcs.toLayer(
  CodexRpcs.of({
    'codex.createThread': (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.createThread(params)).pipe(
        Effect.withSpan('rpc.codex.createThread', {
          attributes: { model: params.model },
        }),
      ),
    'codex.continueThread': (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.continueThread(params)).pipe(
        Effect.withSpan('rpc.codex.continueThread', {
          attributes: { sessionId: params.sessionId },
        }),
      ),
    'codex.stopThread': ({ sessionId }) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.stopThread(sessionId)).pipe(
        Effect.withSpan('rpc.codex.stopThread', { attributes: { sessionId } }),
      ),
    'codex.updateThread': (params) =>
      Effect.flatMap(CodexOrchestrator, (o) => o.updateThread(params)).pipe(
        Effect.mapError((e) => new CodexChatError({ message: String(e) })),
        Effect.withSpan('rpc.codex.updateThread', {
          attributes: { sessionId: params.sessionId },
        }),
      ),
    'codex.respondToUserInput': (params) =>
      Effect.flatMap(CodexOrchestrator, (o) =>
        o.respondToUserInput(params),
      ).pipe(
        Effect.withSpan('rpc.codex.respondToUserInput', {
          attributes: { sessionId: params.sessionId },
        }),
      ),
    'codex.queryEvents': ({ '>': cursor }) =>
      codexEventSqliteEntity
        .query('byUpdatedAt', { pk: {}, sk: { '>': cursor } })
        .pipe(
          Effect.map(({ items }) =>
            items
              .map(applyProjection)
              .filter((v): v is NonNullable<typeof v> => v !== null),
          ),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
          Effect.withSpan('rpc.codex.queryEvents'),
        ),
    'codex.queryEventsBySession': ({ sessionId, '>': cursor }) =>
      codexEventSqliteEntity
        .query('bySession', { pk: { sessionId }, sk: { '>': cursor } })
        .pipe(
          Effect.map(({ items }) =>
            items
              .map(applyProjection)
              .filter((v): v is NonNullable<typeof v> => v !== null),
          ),
          Effect.mapError((e) => new CodexChatError({ message: String(e) })),
          Effect.withSpan('rpc.codex.queryEventsBySession', {
            attributes: { sessionId },
          }),
        ),
  }),
);
