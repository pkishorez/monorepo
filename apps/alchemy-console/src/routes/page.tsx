import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { AccountMenu } from '../client/features/auth-boundary/index.ts';
import { Workspace } from '../client/features/store-console/workspace/index.ts';

export const Route = createFileRoute('/')({ component: LandingPage });

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

function LandingPage() {
  const navigate = Route.useNavigate();
  const open = useCallback(
    (storeId: string) =>
      void navigate({
        to: '/stores/$storeId',
        params: { storeId },
        replace: true,
      }),
    [navigate],
  );
  return (
    <div className="min-h-svh">
      <header className="flex h-12 items-center justify-between border-b px-4 sm:px-6">
        <span className="text-sm font-medium tracking-tight">
          Alchemy Console
        </span>
        <AccountMenu />
      </header>
      <Workspace
        mode="landing"
        StoreLink={StoreLink}
        onStore={open}
        onStoreCreated={open}
      />
    </div>
  );
}
