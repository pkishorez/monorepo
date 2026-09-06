import { StdTable } from 'std-toolkit/db';

export const appTable = StdTable.make('alchemy-console')
  .primary('pk', 'sk')
  .build();
