import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Shell } from '../../../../client/screens/shell/index.ts';

// Every Place of Ledger, inside its shell, for a signed-in user.
export const Route = createFileRoute('/_ledger')({
  component: LedgerRoute,
});

function LedgerRoute() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
