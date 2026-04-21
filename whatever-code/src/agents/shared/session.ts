import { Effect } from 'effect';
import { sessionSqliteEntity } from '../../db/entities/session.js';
import type { InteractionMode } from '../../core/entity/session/session.js';
import type { TaskStatus } from '../../core/entity/status.js';

export const initSessionsForType = <R>(
  sessionType: 'claude' | 'codex',
  markTurnsInterrupted: (sessionId: string) => Effect.Effect<void, never, R>,
) =>
  Effect.gen(function* () {
    const { items: inProgressSessions } = yield* sessionSqliteEntity
      .query('byStatus', { pk: { status: 'in_progress' }, sk: { '>': null } })
      .pipe(Effect.orDie);

    yield* Effect.forEach(
      inProgressSessions.filter((s) => s.value.type === sessionType),
      ({ value }) =>
        Effect.all(
          [
            sessionSqliteEntity
              .update(
                { sessionId: value.sessionId },
                { status: 'interrupted' as TaskStatus },
              )
              .pipe(Effect.orDie),
            markTurnsInterrupted(value.sessionId),
          ],
          { discard: true },
        ),
      { discard: true },
    );
  });

export const updateSessionPayload = (
  sessionId: string,
  expectedType: 'claude' | 'codex',
  updates: {
    model?: string;
    interactionMode?: typeof InteractionMode.Type;
    [key: string]: unknown;
  },
) =>
  Effect.gen(function* () {
    const row = yield* sessionSqliteEntity
      .get({ sessionId })
      .pipe(Effect.orDie);
    if (!row || row.value.payload.type !== expectedType) {
      return yield* Effect.die(
        new Error(`${expectedType} session ${sessionId} not found`),
      );
    }
    const { model, interactionMode, ...payloadUpdates } = updates;
    const updatedPayload = { ...row.value.payload, ...payloadUpdates };
    yield* sessionSqliteEntity
      .update(
        { sessionId },
        {
          ...(model !== undefined ? { model } : {}),
          ...(interactionMode !== undefined ? { interactionMode } : {}),
          payload: updatedPayload,
        },
      )
      .pipe(Effect.orDie);
  });
