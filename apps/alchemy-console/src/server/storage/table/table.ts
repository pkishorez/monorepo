import { StdTable } from 'std-toolkit/db';

// One physical table holds every Console entity, partitioned by user.
export const consoleTable = StdTable.make('alchemy-console')
  .primary('pk', 'sk')
  .build();
