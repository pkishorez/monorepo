import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AccountMenu } from '../../client/features/auth-boundary/index.ts';
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
      <header className="flex h-12 items-center justify-between border-b px-4 sm:px-6">
        <Link to="/" className="text-sm font-medium tracking-tight">
          Alchemy Console
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
