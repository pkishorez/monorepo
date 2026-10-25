import { Effect, Schema, Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { WireEntity } from '../api/contract/index.js';
import { projectEngineRaw, Store } from '../engine/index.js';
import {
  Harnesses,
  projectRaw as projectHarnessRaw,
} from '@kestack/ai-toolkit/harness';
import {
  MessageSchema,
  type Message,
  type Raw,
} from '@kestack/ai-toolkit/contract';
import { ProjectSchema, SessionSchema } from '../api/records/index.js';
import { follow } from './follow.js';

/*
 * The feeds, as the API sends them: every change after the client's cursor,
 * then live, in encoded form. Projects and Sessions go out as stored. A
 * session's Messages are made on the way out: each Raw projected by the
 * harness that wrote it, or by the engine, with the Raw's id and meta, and
 * a Raw that projects to nothing is left out.
 */

const encodeProject = Schema.encodeEffect(ProjectSchema.entity);
const encodeSession = Schema.encodeEffect(SessionSchema.entity);
const encodeMessage = Schema.encodeEffect(MessageSchema.entity);

const cursorOf = (after: WireEntity | null) => after?.meta._u ?? null;

const encodeAll = <T>(
  encode: (entity: Entity<T>) => Effect.Effect<unknown, unknown>,
  batch: ReadonlyArray<Entity<T>>,
) =>
  Effect.forEach(batch, (entity) => encode(entity)).pipe(
    Effect.orDie,
  ) as Effect.Effect<ReadonlyArray<WireEntity>>;

/** One Raw's Message, or null when its writer makes none of it. */
export const projectRaw = (
  harnesses: Harnesses['Service'],
  raw: Raw,
): Effect.Effect<Message | null> =>
  Effect.gen(function* () {
    const project =
      raw.harness === 'engine'
        ? projectEngineRaw
        : projectHarnessRaw(harnesses.all);
    const projected = yield* Effect.try(() => project(raw)).pipe(
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning(
            `Could not project Raw ${raw.id} (${raw.kind})`,
            error,
          ),
          null,
        ),
      ),
    );
    if (projected === null) return null;
    return {
      id: raw.id,
      sessionId: raw.sessionId,
      turnId: raw.turnId,
      at: raw.at,
      agentId: projected.agentId,
      role: projected.role,
      parts: projected.parts,
    };
  });

export const projects = (after: WireEntity | null) =>
  Stream.unwrap(
    Effect.map(Store, (store) =>
      follow(store.projects, cursorOf(after)).pipe(
        Stream.mapEffect((batch) => encodeAll(encodeProject, batch)),
      ),
    ),
  );

export const sessions = (after: WireEntity | null) =>
  Stream.unwrap(
    Effect.map(Store, (store) =>
      follow(store.sessions, cursorOf(after)).pipe(
        Stream.mapEffect((batch) => encodeAll(encodeSession, batch)),
      ),
    ),
  );

export const messages = (sessionId: string, after: WireEntity | null) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const store = yield* Store;
      const harnesses = yield* Harnesses;
      const toMessage = (raw: Entity<Raw>) =>
        Effect.map(
          projectRaw(harnesses, raw.value),
          (value): ReadonlyArray<Entity<Message>> =>
            value === null
              ? []
              : [
                  {
                    value,
                    meta: {
                      ...raw.meta,
                      _e: MessageSchema.name,
                      _v: MessageSchema.latestVersion,
                    },
                  },
                ],
        );
      // The first batch goes out even when every Raw in it projects to
      // nothing: it is the answer that tells the reader it is Caught Up.
      let first = true;
      return follow(store.raws(sessionId), cursorOf(after)).pipe(
        Stream.mapEffect((batch) =>
          Effect.flatMap(
            Effect.map(Effect.forEach(batch, toMessage), (all) => all.flat()),
            (made) => encodeAll(encodeMessage, made),
          ),
        ),
        Stream.filter((batch) => {
          const keep = first || batch.length > 0;
          first = false;
          return keep;
        }),
      );
    }),
  );
