import { StdTable } from 'std-toolkit/db';

export const appTable = StdTable.make('__APP_NAME__')
  .primary('pk', 'sk')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .gsi('GSI3', 'gsi3pk', 'gsi3sk')
  .gsi('GSI4', 'gsi4pk', 'gsi4sk')
  .build();
