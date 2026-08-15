import { Effect, Schema } from 'effect';
import { Ulid } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { sequentialUlid } from '../support.js';

export const DocSchema = EntityESchema.make('Doc', 'docId', {
  title: Schema.String,
  category: Schema.String,
}).build();

export const flatTable = StdTable.make('docs').primary('pk', 'sk').build();

export const indexedTable = StdTable.make('docs')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const flatDoc = flatTable.entity(DocSchema).primary({ pk: [] }).build();

export const indexedDoc = indexedTable
  .entity(DocSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byCategory', { pk: ['category'] })
  .build();

export const withUlid = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(Ulid, sequentialUlid()));

export const openRaw = (
  factory: IDBFactory,
  databaseName: string,
  version?: number,
) =>
  Effect.promise(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request =
          version === undefined
            ? factory.open(databaseName)
            : factory.open(databaseName, version);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
