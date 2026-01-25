import type { AnyESchema, ESchemaType } from "@std-toolkit/eschema";
import { Effect, Option } from "effect";
import { IDBError } from "./error.js";
import type { IDBStore } from "./store.js";

export class IDBEntity<
  TName extends string,
  TSchema extends AnyESchema,
  TKey extends keyof ESchemaType<TSchema>,
> {
  static make<TName extends string>(name: TName) {
    return {
      eschema: <TSchema extends AnyESchema>(eschema: TSchema) => ({
        id: <TKey extends keyof ESchemaType<TSchema>>(key: TKey) => ({
          build: (store: IDBStore) => {
            return new IDBEntity<TName, TSchema, TKey>(name, eschema, key, store);
          },
        }),
      }),
    };
  }

  #store: IDBStore;
  #name: TName;
  #eschema: TSchema;
  #key: TKey;

  private constructor(name: TName, eschema: TSchema, key: TKey, store: IDBStore) {
    this.#name = name;
    this.#eschema = eschema;
    this.#key = key;
    this.#store = store;
  }

  query(): Effect.Effect<ESchemaType<TSchema>[], IDBError> {
    return Effect.gen(this, function* () {
      const items = yield* this.#store.getAll(
        IDBKeyRange.bound([this.#name], [this.#name, "\uffffff"]),
      );

      const results: ESchemaType<TSchema>[] = [];
      for (const item of items) {
        const decoded = yield* this.#eschema.decode(item.value).pipe(
          Effect.mapError((cause) => IDBError.queryFailed("Failed to decode item", cause)),
        );
        results.push(decoded as ESchemaType<TSchema>);
      }

      return results;
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBEntity.query"));
  }

  get(id: string): Effect.Effect<Option.Option<ESchemaType<TSchema>>, IDBError> {
    return Effect.gen(this, function* () {
      const item = yield* this.#store.getItem({ entity: this.#name, id });
      if (Option.isNone(item)) return Option.none();

      const decoded = yield* this.#eschema.decode(item.value.value).pipe(
        Effect.mapError((cause) => IDBError.getFailed("Failed to decode item", cause)),
      );

      return Option.some(decoded as ESchemaType<TSchema>);
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBEntity.get"));
  }

  put(item: Omit<ESchemaType<TSchema>, "_v">): Effect.Effect<void, IDBError> {
    return Effect.gen(this, function* () {
      const encoded = yield* this.#eschema.encode(item as ESchemaType<TSchema>["Type"]).pipe(
        Effect.mapError((cause) => IDBError.putFailed("Failed to encode item", cause)),
      );

      const id = String(encoded[this.#key as keyof typeof encoded]);

      yield* this.#store.put({
        entity: this.#name,
        id,
        value: encoded,
      });
    }).pipe(Effect.withSpan("@std-toolkit/db-idb: IDBEntity.put"));
  }

  delete(id: string): Effect.Effect<void, IDBError> {
    return this.#store
      .delete({ entity: this.#name, id })
      .pipe(Effect.withSpan("@std-toolkit/db-idb: IDBEntity.delete"));
  }
}
