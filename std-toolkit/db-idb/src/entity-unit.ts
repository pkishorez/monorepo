import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect } from "effect";
import { IDBError } from "./error.js";
import type { IDBStore } from "./store.js";

export class IDBEntityUnit<TName extends string, TSchema extends AnyESchema> {
  static make<TName extends string>(name: TName) {
    return {
      eschema: <TSchema extends AnyESchema>(eschema: TSchema) => ({
        build: (store: IDBStore) => {
          return new IDBEntityUnit<TName, TSchema>(name, eschema, store);
        },
      }),
    };
  }

  #store: IDBStore;
  #name: TName;
  #eschema: TSchema;

  private constructor(name: TName, eschema: TSchema, store: IDBStore) {
    this.#name = name;
    this.#eschema = eschema;
    this.#store = store;
  }

  get unitId(): string {
    return `UNIT_${this.#name}`;
  }

  get(): Effect.Effect<ESchemaType<TSchema> | undefined, IDBError> {
    return Effect.gen(this, function* () {
      const item = yield* this.#store.getItem({
        entity: this.#name,
        id: this.unitId,
      });

      if (!item) return undefined;

      const decoded = yield* this.#eschema.decode(item.value).pipe(
        Effect.mapError((cause) => IDBError.getFailed("Failed to decode unit item", cause)),
      );

      return decoded as ESchemaType<TSchema>;
    });
  }

  put(item: Omit<ESchemaType<TSchema>, "_v">): Effect.Effect<void, IDBError> {
    return Effect.gen(this, function* () {
      const encoded = yield* this.#eschema.encode(item as ESchemaType<TSchema>["Type"]).pipe(
        Effect.mapError((cause) => IDBError.putFailed("Failed to encode unit item", cause)),
      );

      yield* this.#store.put({
        entity: this.#name,
        id: this.unitId,
        value: encoded,
      });
    });
  }
}
