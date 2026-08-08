export const tableIdentityTypeId = Symbol(
  'std-toolkit/dynamodb/table-identity',
);

export interface TableIdentity {
  readonly logicalName: string;
  readonly [tableIdentityTypeId]: object;
}

export const makeTableIdentity = (logicalName: string): TableIdentity => ({
  logicalName,
  [tableIdentityTypeId]: {},
});

export const getTableIdentity = (table: TableIdentity): object =>
  table[tableIdentityTypeId];
