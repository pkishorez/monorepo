import { Effect } from "effect";
import type {
  CommandError,
  CommandPayload,
  CommandPayloadSchemaType,
  CommandProcessor,
  CommandResponse,
  DeletePayload,
  DeleteResponse,
  DescriptorPayload,
  DescriptorResponse,
  InsertPayload,
  InsertResponse,
  QueryPayload,
  QueryResponse,
  SkCondition,
  UpdatePayload,
  UpdateResponse,
} from "@std-toolkit/core/command";
import { CommandError as CommandErrorClass } from "@std-toolkit/core/command";
import type { EntityRegistry } from "./entity-registry.js";
import type { SQLiteEntity } from "./sqlite-entity.js";
import type { SQLiteTableInstance } from "./sqlite-table.js";
import type { SqliteDB } from "../sql/db.js";
import type { SkParam } from "../internal/utils.js";

/**
 * Creates timing information for a command.
 */
const createTiming = (startedAt: number) => {
  const completedAt = Date.now();
  return {
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
  };
};

type AnyEntity = SQLiteEntity<any, any, any, any>;

/**
 * SQLite command processor for unified CRUD operations.
 * Takes JSON payloads and returns consistent responses with timing information.
 *
 * @typeParam TRegistry - The entity registry type
 */
export class SqliteCommand<
  TRegistry extends EntityRegistry<SQLiteTableInstance, Record<string, AnyEntity>>,
> implements CommandProcessor<SqliteDB>
{
  static readonly RPC_PREFIX = "__std-toolkit__command" as const;

  /**
   * Creates a new SqliteCommand instance.
   *
   * @param registry - The entity registry
   * @returns A new SqliteCommand instance
   */
  static make<TRegistry extends EntityRegistry<SQLiteTableInstance, Record<string, AnyEntity>>>(
    registry: TRegistry,
  ): SqliteCommand<TRegistry> {
    return new SqliteCommand(registry);
  }

  #registry: TRegistry;

  constructor(registry: TRegistry) {
    this.#registry = registry;
  }

  /**
   * Gets the entity registry.
   */
  get registry(): TRegistry {
    return this.#registry;
  }

  /**
   * Processes an insert command.
   */
  process(payload: InsertPayload): Effect.Effect<InsertResponse, CommandError, SqliteDB>;
  /**
   * Processes an update command.
   */
  process(payload: UpdatePayload): Effect.Effect<UpdateResponse, CommandError, SqliteDB>;
  /**
   * Processes a delete command.
   */
  process(payload: DeletePayload): Effect.Effect<DeleteResponse, CommandError, SqliteDB>;
  /**
   * Processes a query command.
   */
  process(payload: QueryPayload): Effect.Effect<QueryResponse, CommandError, SqliteDB>;
  /**
   * Processes a descriptor command.
   */
  process(payload: DescriptorPayload): Effect.Effect<DescriptorResponse, CommandError, SqliteDB>;
  /**
   * Processes any command payload.
   */
  process(payload: CommandPayload): Effect.Effect<CommandResponse, CommandError, SqliteDB>;
  process(payload: CommandPayload): Effect.Effect<CommandResponse, CommandError, SqliteDB> {
    switch (payload.operation) {
      case "insert":
        return this.#processInsert(payload);
      case "update":
        return this.#processUpdate(payload);
      case "delete":
        return this.#processDelete(payload);
      case "query":
        return this.#processQuery(payload);
      case "descriptor":
        return this.#processDescriptor(payload);
    }
  }

  #processInsert(payload: InsertPayload): Effect.Effect<InsertResponse, CommandError, SqliteDB> {
    const self = this;
    return Effect.gen(function* () {
      const startedAt = Date.now();
      const entity = self.#getEntity(payload.entity);

      const result = yield* entity.insert(payload.data as any).pipe(
        Effect.mapError((e) =>
          new CommandErrorClass({
            operation: "insert",
            entity: payload.entity,
            message: `Insert failed: ${String(e)}`,
            cause: e,
          }),
        ),
      );

      return {
        operation: "insert" as const,
        entity: payload.entity,
        data: result,
        timing: createTiming(startedAt),
      };
    });
  }

  #processUpdate(payload: UpdatePayload): Effect.Effect<UpdateResponse, CommandError, SqliteDB> {
    const self = this;
    return Effect.gen(function* () {
      const startedAt = Date.now();
      const entity = self.#getEntity(payload.entity);

      const result = yield* entity.update(payload.key as any, payload.data as any).pipe(
        Effect.mapError((e) =>
          new CommandErrorClass({
            operation: "update",
            entity: payload.entity,
            message: `Update failed: ${String(e)}`,
            cause: e,
          }),
        ),
      );

      return {
        operation: "update" as const,
        entity: payload.entity,
        data: result,
        timing: createTiming(startedAt),
      };
    });
  }

  #processDelete(payload: DeletePayload): Effect.Effect<DeleteResponse, CommandError, SqliteDB> {
    const self = this;
    return Effect.gen(function* () {
      const startedAt = Date.now();
      const entity = self.#getEntity(payload.entity);

      const result = yield* entity.delete(payload.key as any).pipe(
        Effect.mapError((e) =>
          new CommandErrorClass({
            operation: "delete",
            entity: payload.entity,
            message: `Delete failed: ${String(e)}`,
            cause: e,
          }),
        ),
      );

      return {
        operation: "delete" as const,
        entity: payload.entity,
        data: result,
        timing: createTiming(startedAt),
      };
    });
  }

  #processQuery(payload: QueryPayload): Effect.Effect<QueryResponse, CommandError, SqliteDB> {
    const self = this;
    return Effect.gen(function* () {
      const startedAt = Date.now();
      const entity = self.#getEntity(payload.entity);

      const sk = self.#convertSkCondition(payload.sk);
      const queryParams = { pk: payload.pk, sk } as any;
      const options = payload.limit !== undefined ? { limit: payload.limit } : undefined;

      const result = yield* entity.query(payload.index as any, queryParams, options).pipe(
        Effect.mapError((e) =>
          new CommandErrorClass({
            operation: "query",
            entity: payload.entity,
            message: `Query failed: ${String(e)}`,
            cause: e,
          }),
        ),
      );

      return {
        operation: "query" as const,
        entity: payload.entity,
        items: result.items,
        timing: createTiming(startedAt),
      };
    });
  }

  #processDescriptor(_payload: DescriptorPayload): Effect.Effect<DescriptorResponse, CommandError, SqliteDB> {
    const self = this;
    return Effect.sync(() => {
      const startedAt = Date.now();

      return {
        operation: "descriptor" as const,
        timing: createTiming(startedAt),
        descriptors: self.#registry.getSchema().descriptors,
      };
    });
  }

  #getEntity(name: string): AnyEntity {
    const entityNames = this.#registry.entityNames;
    if (!entityNames.includes(name)) {
      throw new Error(`Entity "${name}" not found in registry`);
    }
    return this.#registry.entity(name as any);
  }

  #convertSkCondition(sk: SkCondition): SkParam {
    return sk as SkParam;
  }

  /**
   * Creates an RPC handler object for use with @effect/rpc.
   *
   * @param suffix - Optional suffix to append to the RPC name
   * @returns An object with the RPC handler
   */
  toRpcHandler<S extends string = "">(suffix?: S) {
    const self = this;
    const s = (suffix ?? "") as S;
    const handlerName = `${SqliteCommand.RPC_PREFIX}${s}` as const;

    const handler = (payload: CommandPayloadSchemaType) =>
      self.process(payload as CommandPayload);

    return { [handlerName]: handler } as {
      [K in `${typeof SqliteCommand.RPC_PREFIX}${S}`]: typeof handler;
    };
  }
}
