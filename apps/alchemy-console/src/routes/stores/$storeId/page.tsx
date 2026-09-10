import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { AccountMenu } from '../../../client/features/auth-boundary/index.ts';
import {
  Workspace,
  type ExplorerLocation,
} from '../../../client/features/store-console/workspace/index.ts';

const text = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const Route = createFileRoute('/stores/$storeId/')({
  validateSearch: (search: Record<string, unknown>): ExplorerLocation => {
    const stack = text(search.stack);
    const stage = stack !== undefined ? text(search.stage) : undefined;
    const resource = stage !== undefined ? text(search.resource) : undefined;
    return { stack, stage, resource };
  },
  component: StorePage,
});

function StorePage() {
  const [busy, setBusy] = useState(false);
  useBlocker({ shouldBlockFn: () => busy, enableBeforeUnload: () => busy });
  const { storeId } = Route.useParams();
  const { stack, stage, resource } = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = useCallback(
    (location: ExplorerLocation) =>
      void navigate({ search: location, replace: true }),
    [navigate],
  );
  return (
    <Workspace
      mode="explore"
      storeId={storeId}
      onBusyChange={setBusy}
      stack={stack}
      stage={stage}
      resource={resource}
      NavigationLink={NavigationLink}
      StoreLink={StoreLink}
      ManageLink={ManageLink}
      onNavigate={go}
      onStoreCreated={(created) => {
        void navigate({
          to: '/stores/$storeId',
          params: { storeId: created },
          search: {},
        });
      }}
      sidebarFooter={<AccountMenu />}
    />
  );
}

function StoreLink({
  storeId,
  ...props
}: {
  storeId: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link to="/stores/$storeId" params={{ storeId }} search={{}} {...props} />
  );
}

function ManageLink(props: { className?: string; children?: ReactNode }) {
  return <Link to="/stores" {...props} />;
}

function NavigationLink({
  home,
  stack,
  stage,
  resource,
  ...props
}: ExplorerLocation & {
  home?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const { storeId } = Route.useParams();
  return home ? (
    <Link to="/stores" {...props} />
  ) : (
    <Link
      to="/stores/$storeId"
      params={{ storeId }}
      search={{ stack, stage, resource }}
      {...props}
    />
  );
}
