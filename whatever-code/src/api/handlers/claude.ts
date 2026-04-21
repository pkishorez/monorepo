import { Effect } from 'effect';
import { ClaudeChatError, ClaudeRpcs } from '../definitions/claude.js';
import { ClaudeOrchestrator } from '../../agents/claude/claude.js';
import { claudeMessageSqliteEntity } from '../../db/entities/claude.js';
import { applyProjection } from '../../projection.js';

export const ClaudeHandlers = ClaudeRpcs.toLayer(
  ClaudeRpcs.of({
    'claude.createSession': (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.createSession(params)).pipe(
        Effect.withSpan('rpc.claude.createSession', {
          attributes: {
            model: params.model,
            interactionMode: params.interactionMode ?? 'default',
          },
        }),
      ),
    'claude.continueSession': (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.continueSession(params)).pipe(
        Effect.withSpan('rpc.claude.continueSession', {
          attributes: { sessionId: params.sessionId },
        }),
      ),
    'claude.stopSession': ({ sessionId }) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.stopSession(sessionId)).pipe(
        Effect.withSpan('rpc.claude.stopSession', {
          attributes: { sessionId },
        }),
      ),
    'claude.updateSession': (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.updateSession(params)).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        Effect.withSpan('rpc.claude.updateSession', {
          attributes: { sessionId: params.sessionId },
        }),
      ),
    'claude.respondToTool': (params) =>
      Effect.flatMap(ClaudeOrchestrator, (o) => o.respondToTool(params)).pipe(
        Effect.withSpan('rpc.claude.respondToTool', {
          attributes: {
            sessionId: params.sessionId,
            toolUseId: params.toolUseId,
          },
        }),
      ),
    'claude.queryMessages': ({ '>': cursor }) =>
      Effect.gen(function* () {
        let currentCursor = cursor;
        const projected: NonNullable<ReturnType<typeof applyProjection>>[] = [];

        while (true) {
          const { items } = yield* claudeMessageSqliteEntity.query(
            'byUpdatedAt',
            { pk: {}, sk: { '>': currentCursor } },
          );
          if (items.length === 0) break;

          for (const item of items) {
            const p = applyProjection(item);
            if (p) projected.push(p);
          }

          const lastU = items[items.length - 1]!.meta._u;
          if (lastU === currentCursor) break;
          currentCursor = lastU;

          if (projected.length > 0) break;
        }

        return projected;
      }).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        Effect.withSpan('rpc.claude.queryMessages'),
      ),
    'claude.queryMessagesBySession': ({ sessionId, '>': cursor }) =>
      Effect.gen(function* () {
        let currentCursor = cursor;
        const projected: NonNullable<ReturnType<typeof applyProjection>>[] = [];

        while (true) {
          const { items } = yield* claudeMessageSqliteEntity.query(
            'bySession',
            { pk: { sessionId }, sk: { '>': currentCursor } },
          );
          if (items.length === 0) break;

          for (const item of items) {
            const p = applyProjection(item);
            if (p) projected.push(p);
          }

          const lastU = items[items.length - 1]!.meta._u;
          if (lastU === currentCursor) break;
          currentCursor = lastU;

          if (projected.length > 0) break;
        }

        return projected;
      }).pipe(
        Effect.mapError((e) => new ClaudeChatError({ message: String(e) })),
        Effect.withSpan('rpc.claude.queryMessagesBySession', {
          attributes: { sessionId },
        }),
      ),
  }),
);
