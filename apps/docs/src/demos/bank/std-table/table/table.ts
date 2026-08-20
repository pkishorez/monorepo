import { StdTable } from 'std-toolkit/db';

export const bankTable = StdTable.make('bank')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();
