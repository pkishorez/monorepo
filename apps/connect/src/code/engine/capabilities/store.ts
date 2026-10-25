import { Context, type Effect, type Scope, type Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { HarnessName, Raw } from '@kestack/ai-toolkit/contract';
import type {
  HarnessConfig,
  Project,
  Session,
} from '../../api/records/index.js';

/*
 * Where the code App Group keeps its records: Raw, Projects, Sessions and
 * Harness Configs. The implementation is services/store/.
 */

/** One stream of changes: read after a cursor, then follow live. */
export interface Feed<T> {
  /** Up to `limit` records changed after the `_u` cursor, oldest change first. */
  readonly after: (
    cursor: string | null,
    limit?: number,
  ) => Effect.Effect<{
    readonly items: ReadonlyArray<Entity<T>>;
    readonly hasMore: boolean;
  }>;
  /** Every later write, subscribed by the time this Effect succeeds. */
  readonly changes: Effect.Effect<Stream.Stream<Entity<T>>, never, Scope.Scope>;
}

export interface StoreService {
  readonly appendRaw: (raw: Raw) => Effect.Effect<Entity<Raw>>;
  readonly raws: (sessionId: string) => Feed<Raw>;
  /** The newest Raw of a session, if any. */
  readonly lastRaw: (sessionId: string) => Effect.Effect<Raw | null>;
  readonly projects: Feed<Project>;
  readonly sessions: Feed<Session>;
  /** A Project that is not removed. */
  readonly project: (id: string) => Effect.Effect<Project | null>;
  /** Every Project that is not removed, oldest change first. */
  readonly allProjects: Effect.Effect<ReadonlyArray<Project>>;
  /** Writes a Project unless it is unchanged or removed. */
  readonly saveProject: (project: Project) => Effect.Effect<void>;
  /** Tombstones a Project; false if there was none to remove. */
  readonly removeProject: (id: string) => Effect.Effect<boolean>;
  readonly session: (id: string) => Effect.Effect<Session | null>;
  readonly allSessions: Effect.Effect<ReadonlyArray<Session>>;
  /** Writes a Session unless it is unchanged. */
  readonly saveSession: (session: Session) => Effect.Effect<void>;
  /** The Harness Binary a harness is set to; null when it has never been set. */
  readonly harnessConfig: (
    harness: HarnessName,
  ) => Effect.Effect<HarnessConfig | null>;
  readonly saveHarnessConfig: (config: HarnessConfig) => Effect.Effect<void>;
}

export class Store extends Context.Service<Store, StoreService>()(
  '@kestack/connect/Store',
) {}
