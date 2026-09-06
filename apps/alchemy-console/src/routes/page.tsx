import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StoreList } from '../client/features/store-list/index.ts';

export const Route = createFileRoute('/')({ component: StoresPage });

function StoreLink({
  storeId,
  ...props
}: {
  storeId: string;
  className?: string;
  children: ReactNode;
}) {
  return <Link to="/stores/$storeId" params={{ storeId }} {...props} />;
}

function StoresPage() {
  const navigate = Route.useNavigate();
  return (
    <StoreList
      StoreLink={StoreLink}
      onStoreCreated={(storeId) => {
        void navigate({ to: '/stores/$storeId', params: { storeId } });
      }}
    />
  );
}
