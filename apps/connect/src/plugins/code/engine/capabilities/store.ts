import { Context, type Effect, type Scope, type Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { Raw } from '@kestack/ai-toolkit/contract';
import type {
  HarnessAccountRecord,
  Project,
  Session,
} from '../../records/index.js';

/*
 * Where the code Plugin keeps its records: Raw, Projects, Sessions and
 * Harness Accounts. The implementation is services/store/.
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
  /** The Raw of a session's newest Turn, in write order; empty with none. */
  readonly lastTurn: (sessionId: string) => Effect.Effect<ReadonlyArray<Raw>>;
  readonly projects: Feed<Project>;
  readonly sessions: Feed<Session>;
  /** A Project that is not removed. */
  readonly project: (id: string) => Effect.Effect<Project | null>;
  /** Every Project that is not removed, oldest change first. */
  readonly allProjects: Effect.Effect<ReadonlyArray<Project>>;
  /** Writes a Project unless it is unchanged or removed. */
  readonly saveProject: (project: Project) => Effect.Effect<void>;
  /** Tombstones a Project and its Sessions; false if there was none to remove. */
  readonly removeProject: (id: string) => Effect.Effect<boolean>;
  /** Tombstones a Session; false if there was none to remove. */
  readonly removeSession: (id: string) => Effect.Effect<boolean>;
  /** A Session that is not removed. */
  readonly session: (id: string) => Effect.Effect<Session | null>;
  /** Every Session that is not removed, oldest change first. */
  readonly allSessions: Effect.Effect<ReadonlyArray<Session>>;
  /** Writes a Session unless it is unchanged or removed. */
  readonly saveSession: (session: Session) => Effect.Effect<void>;
  /** Every Harness Account the user saved that is not removed, oldest change first. */
  readonly harnessAccounts: Effect.Effect<ReadonlyArray<HarnessAccountRecord>>;
  /** Writes a Harness Account unless it is unchanged or removed. */
  readonly saveHarnessAccount: (
    account: HarnessAccountRecord,
  ) => Effect.Effect<void>;
  /** Tombstones a Harness Account; false if there was none to remove. */
  readonly removeHarnessAccount: (id: string) => Effect.Effect<boolean>;
}

export class Store extends Context.Service<Store, StoreService>()(
  '@kestack/connect/Store',
) {}
