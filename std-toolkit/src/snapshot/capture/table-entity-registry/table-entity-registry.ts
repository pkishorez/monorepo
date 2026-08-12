import type { TableEntitySnapshotSource } from '../../domain/index.js';

export const tableSnapshotSource = Symbol('std-toolkit/table-snapshot-source');

export interface TableSnapshotEntity {
  readonly name: string;
  [tableSnapshotSource](): TableEntitySnapshotSource;
}

export function createTableEntityRegistry() {
  const entities: TableSnapshotEntity[] = [];
  return {
    register(entity: TableSnapshotEntity): void {
      if (entities.some((existing) => existing.name === entity.name)) {
        throw new Error(
          `Entity "${entity.name}" is already defined on this table`,
        );
      }
      entities.push(entity);
    },
    snapshotSources: (): TableEntitySnapshotSource[] =>
      entities.map((entity) => entity[tableSnapshotSource]()),
  } as const;
}
