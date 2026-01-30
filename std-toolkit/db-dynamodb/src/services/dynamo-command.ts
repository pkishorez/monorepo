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
import type { DynamoEntity } from "./dynamo-entity.js";
import type { DynamoTableInstance } from "./dynamo-table.js";
import type { SkParam } from "../types/index.js";

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

type AnyEntity = DynamoEntity<any, any, any, any, any>;
type AnyEntitiesMap = Record<string, AnyEntity>;
type AnyRegistry = EntityRegistry<DynamoTableInstance, AnyEntitiesMap>;

/**
 * DynamoDB command processor for unified CRUD operations.
 * Takes JSON payloads and returns consistent responses with timing information.
 *
 * @typeParam TRegistry - The entity registry type
 */
export class DynamoCommand<TRegistry extends AnyRegistry = AnyRegistry>
  implements CommandProcessor
{
  static readonly RPC_PREFIX = "__std-toolkit__command" as const;

  /**
   * Creates a new DynamoCommand instance.
   *
   * @param registry - The entity registry
   * @returns A new DynamoCommand instance
   */
  static make(registry: AnyRegistry): DynamoCommand {
    return new DynamoCommand(registry);
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
  process(payload: InsertPayload): Effect.Effect<InsertResponse, CommandError>;
  /**
   * Processes an update command.
   */
  process(payload: UpdatePayload): Effect.Effect<UpdateResponse, CommandError>;
  /**
   * Processes a delete command.
   */
  process(payload: DeletePayload): Effect.Effect<DeleteResponse, CommandError>;
  /**
   * Processes a query command.
   */
  process(payload: QueryPayload): Effect.Effect<QueryResponse, CommandError>;
  /**
   * Processes a descriptor command.
   */
  process(payload: DescriptorPayload): Effect.Effect<DescriptorResponse, CommandError>;
  /**
   * Processes any command payload.
   */
  process(payload: CommandPayload): Effect.Effect<CommandResponse, CommandError>;
  process(payload: CommandPayload): Effect.Effect<CommandResponse, CommandError> {
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

  #processInsert(payload: InsertPayload): Effect.Effect<InsertResponse, CommandError> {
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

  #processUpdate(payload: UpdatePayload): Effect.Effect<UpdateResponse, CommandError> {
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

  #processDelete(payload: DeletePayload): Effect.Effect<DeleteResponse, CommandError> {
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

  #processQuery(payload: QueryPayload): Effect.Effect<QueryResponse, CommandError> {
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

  #processDescriptor(_payload: DescriptorPayload): Effect.Effect<DescriptorResponse, CommandError> {
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
    const handlerName = `${DynamoCommand.RPC_PREFIX}${s}` as const;

    const handler = (payload: CommandPayloadSchemaType) =>
      self.process(payload as CommandPayload);

    return { [handlerName]: handler } as {
      [K in `${typeof DynamoCommand.RPC_PREFIX}${S}`]: typeof handler;
    };
  }
}
