import { it } from 'vitest';
import { expectTableShippable } from '@kestack/std-toolkit/snapshot/vitest';
import { keConnectTable } from '../table.js';

// The table lives in ke-connect.db on every computer that runs a
// Connection, and its setup refuses a breaking change at start, so a
// breaking change would stop every `ke-connect` that kept a Connection. The
// committed file is the table's contract: every entity and every version of
// every schema it reaches. `vitest -u` accepts only changes that keep kept
// rows readable. The Sign-in beside it is auth-toolkit's table, disposable,
// so it needs none.
it('keeps the ke-connect table safe to ship', async () => {
  await expectTableShippable(
    keConnectTable,
    './ke-connect-table.snapshot.json',
  );
});
