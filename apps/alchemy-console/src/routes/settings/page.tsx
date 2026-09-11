import { createFileRoute, Link } from '@tanstack/react-router';
import { AccountMenu } from '../../client/features/auth-boundary/index.ts';
import { Logo } from '../../client/features/brand/index.ts';
import { SettingsPage } from '../../client/features/settings/index.ts';

export const Route = createFileRoute('/settings/')({ component: Page });

function Page() {
  return (
    <div className="min-h-svh">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <Link
          to="/"
          className="flex items-center rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Logo />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/stores"
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Stores
          </Link>
          <AccountMenu />
        </nav>
      </header>
      <SettingsPage />
    </div>
  );
}
