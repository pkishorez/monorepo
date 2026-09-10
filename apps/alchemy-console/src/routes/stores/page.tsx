import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AccountMenu } from '../../client/features/auth-boundary/index.ts';
import { Logo } from '../../client/features/brand/index.ts';
import { Workspace } from '../../client/features/store-console/workspace/index.ts';

export const Route = createFileRoute('/stores/')({ component: StoresPage });

function StoreLink({
  storeId,
  ...props
}: {
  storeId: string;
  className?: string;
  children?: ReactNode;
}) {
  return <Link to="/stores/$storeId" params={{ storeId }} {...props} />;
}

function StoresPage() {
  const navigate = Route.useNavigate();
  return (
    <div className="min-h-svh">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <Link
          to="/"
          className="flex items-center rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Logo />
        </Link>
        <AccountMenu />
      </header>
      <Workspace
        mode="management"
        StoreLink={StoreLink}
        onStoreCreated={(storeId) => {
          void navigate({ to: '/stores/$storeId', params: { storeId } });
        }}
      />
    </div>
  );
}
