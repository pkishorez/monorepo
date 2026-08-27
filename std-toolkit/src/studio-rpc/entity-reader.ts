import { Effect } from 'effect';
import {
  EntitySchema,
  SingleEntitySchema,
  type DecodedEntity,
  type DecodedSingleEntity,
  type EncodedEntity,
  type EncodedSingleEntity,
} from '../core/index.js';
import type {
  EncodedData,
  StdTableService,
} from '../db/std-table/contract/index.js';
import type {
  KeyedEntityDefinition,
  SingleEntityDefinition,
} from '../db/std-table/definition/index.js';
import {
  makeKeyedEntity,
  makeSingleEntity,
  type QueryPage,
} from '../db/std-table/entity/index.js';
import type { DatabaseError } from '../db/std-table/error/index.js';
import type { StdTable } from '../db/std-table/table/index.js';
import {
  StudioEntityCodecFailed,
  StudioInvalidInput,
  StudioReadFailed,
  StudioUnknownAccessPattern,
  StudioUnknownEntity,
  StudioWrongEntityKind,
  type GetEntityPayload,
  type QueryEntitiesPayload,
} from './protocol.js';
import {
  buildEntityQueryInput,
  rejectSingletonKey,
  validateEntityKey,
} from './query-input.js';

type StudioEncodedEntity = EncodedEntity<EncodedData>;
type StudioEncodedSingleEntity = EncodedSingleEntity<EncodedData>;

interface DynamicKeyedEntity<Name extends string> {
  readonly get: (
    key: object,
  ) => Effect.Effect<
    DecodedEntity<object> | null,
    DatabaseError,
    StdTableService<Name>
  >;
  readonly query: (
    pattern: string,
    input: object,
    options?: {
      readonly limit?: number;
      readonly after?: DecodedEntity<object>;
    },
  ) => Effect.Effect<
    QueryPage<DecodedEntity<object>>,
    DatabaseError,
    StdTableService<Name>
  >;
}

interface DynamicSingleEntity<Name extends string> {
  readonly get: () => Effect.Effect<
    DecodedSingleEntity<object>,
    DatabaseError,
    StdTableService<Name>
  >;
}

const keyedSurface = <Name extends string>(definition: KeyedEntityDefinition) =>
  makeKeyedEntity(
    definition as KeyedEntityDefinition<
      string,
      typeof definition.schema,
      readonly string[],
      readonly [string]
    >,
  ) as unknown as DynamicKeyedEntity<Name>;

const singleSurface = <Name extends string>(
  definition: SingleEntityDefinition,
) => makeSingleEntity(definition) as unknown as DynamicSingleEntity<Name>;

const codecFailure = (
  entity: string,
  direction: StudioEntityCodecFailed['direction'],
) => new StudioEntityCodecFailed({ entity, direction });

const readFailure =
  (operation: StudioReadFailed['operation'], entity: string) =>
  (error: DatabaseError) => {
    if (error.reason._tag === 'DecodeFailed')
      return codecFailure(entity, 'decode-read');
    if (error.reason._tag === 'InvalidQuery')
      return new StudioInvalidInput({
        issues: [{ path: [], message: error.reason.message }],
      });
    return new StudioReadFailed({ entity, operation });
  };

const preserveReadFailure =
  (operation: StudioReadFailed['operation'], entity: string) =>
  <A, R>(effect: Effect.Effect<A, DatabaseError, R>) =>
    effect.pipe(
      Effect.tapError((error) => Effect.logError(error)),
      Effect.mapError(readFailure(operation, entity)),
    );

const encodeKeyed =
  (definition: KeyedEntityDefinition) => (entity: DecodedEntity<object>) =>
    EntitySchema(definition.schema)
      .encode(entity)
      .pipe(
        Effect.tapError((error) => Effect.logError(error)),
        Effect.mapError(() => codecFailure(definition.name, 'encode-result')),
        Effect.map((encoded) => encoded as StudioEncodedEntity),
      );

const encodeSingle =
  (definition: SingleEntityDefinition) =>
  (entity: DecodedSingleEntity<object>) =>
    SingleEntitySchema(definition.schema)
      .encode(entity)
      .pipe(
        Effect.tapError((error) => Effect.logError(error)),
        Effect.mapError(() => codecFailure(definition.name, 'encode-result')),
        Effect.map((encoded) => encoded as StudioEncodedSingleEntity),
      );

const definitionNamed = <Name extends string>(
  table: StdTable<Name>,
  entity: string,
) => table.registeredEntities.find((definition) => definition.name === entity);

export const makeEntityReader = <Name extends string>(
  table: StdTable<Name>,
) => {
  const get = (payload: GetEntityPayload) =>
    Effect.gen(function* () {
      const definition = definitionNamed(table, payload.entity);
      if (definition === undefined)
        return yield* Effect.fail(
          new StudioUnknownEntity({ entity: payload.entity }),
        );
      if (definition.kind === 'single') {
        yield* rejectSingletonKey(payload.key);
        const entity = yield* singleSurface<Name>(definition)
          .get()
          .pipe(preserveReadFailure('get', definition.name));
        return yield* encodeSingle(definition)(entity);
      }
      const key = yield* validateEntityKey(payload.key, [
        ...definition.primary.pk,
        definition.schema.idField,
      ]);
      const entity = yield* keyedSurface<Name>(definition)
        .get(key)
        .pipe(preserveReadFailure('get', definition.name));
      return entity === null ? null : yield* encodeKeyed(definition)(entity);
    });

  const query = (payload: QueryEntitiesPayload) =>
    Effect.gen(function* () {
      const definition = definitionNamed(table, payload.entity);
      if (definition === undefined)
        return yield* Effect.fail(
          new StudioUnknownEntity({ entity: payload.entity }),
        );
      if (definition.kind === 'single')
        return yield* Effect.fail(
          new StudioWrongEntityKind({
            entity: definition.name,
            expected: 'keyed',
            actual: 'single',
          }),
        );
      const pattern = Object.hasOwn(
        definition.accessPatterns,
        payload.accessPattern,
      )
        ? definition.accessPatterns[payload.accessPattern]
        : undefined;
      if (pattern === undefined)
        return yield* Effect.fail(
          new StudioUnknownAccessPattern({
            entity: definition.name,
            accessPattern: payload.accessPattern,
          }),
        );
      const input = yield* buildEntityQueryInput(payload, pattern);
      const after =
        payload.after === undefined
          ? undefined
          : yield* EntitySchema(definition.schema)
              .decode(payload.after)
              .pipe(
                Effect.mapError(() =>
                  codecFailure(definition.name, 'decode-after'),
                ),
              );
      const page = yield* keyedSurface<Name>(definition)
        .query(payload.accessPattern, input, {
          limit: payload.limit ?? 100,
          ...(after === undefined ? {} : { after }),
        })
        .pipe(preserveReadFailure('query', definition.name));
      const items = yield* Effect.forEach(page.items, encodeKeyed(definition));
      return { items, hasMore: page.hasMore };
    });

  return { get, query } as const;
};
