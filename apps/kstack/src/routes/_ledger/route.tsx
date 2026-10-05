import { createFileRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { Shell } from '../../app/shell/index.ts';

// In development only, a tab can try Ledger without signing in, its server
// in the tab; the preview never reaches a production build.
const PreviewLedger = import.meta.env.DEV
  ? lazy(() =>
      import('../../preview/index.ts').then((m) => ({
        default: m.PreviewLedger,
      })),
    )
  : undefined;

const KEY = 'ledger:preview';

// `?preview=on` turns the preview on for this tab, `?preview=off` off.
const previewing = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const asked = new URLSearchParams(location.search).get('preview');
  if (asked === 'on') sessionStorage.setItem(KEY, 'on');
  if (asked === 'off') sessionStorage.removeItem(KEY);
  return sessionStorage.getItem(KEY) === 'on';
};

// Every Place of Ledger, inside its shell, for a signed-in user.
export const Route = createFileRoute('/_ledger')({
  component: LedgerRoute,
});

function LedgerRoute() {
  const [preview] = useState(previewing);
  if (preview && PreviewLedger) {
    return (
      <Suspense>
        <PreviewLedger>
          <Outlet />
        </PreviewLedger>
      </Suspense>
    );
  }
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
