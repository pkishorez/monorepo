import { createFileRoute, Link, useBlocker } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { DeleteStage } from '../../../client/features/delete-stage/index.ts';
import { StoreExplorer } from '../../../client/features/store-explorer/index.ts';

export const Route = createFileRoute('/stores/$storeId/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { stack?: string; stage?: string } => {
    const stack =
      typeof search.stack === 'string' && search.stack.length > 0
        ? search.stack
        : undefined;
    return {
      stack,
      stage:
        stack !== undefined &&
        typeof search.stage === 'string' &&
        search.stage.length > 0
          ? search.stage
          : undefined,
    };
  },
  component: StorePage,
});
function StorePage() {
  const [busy, setBusy] = useState(false);
  useBlocker({ shouldBlockFn: () => busy, enableBeforeUnload: () => busy });
  const { storeId } = Route.useParams();
  const { stack, stage } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <DeleteStage
      storeId={storeId}
      onBusyChange={setBusy}
      onDeleted={(deleted) => {
        if (stack === deleted.stack && stage === deleted.stage)
          void navigate({ search: { stack }, replace: true });
      }}
    >
      {(StageAction) => (
        <StoreExplorer
          key={storeId}
          storeId={storeId}
          stack={stack}
          stage={stage}
          NavigationLink={NavigationLink}
          StageAction={StageAction}
        />
      )}
    </DeleteStage>
  );
}
function NavigationLink({
  home,
  stack,
  stage,
  ...props
}: {
  home?: boolean;
  stack?: string;
  stage?: string;
  className?: string;
  children: ReactNode;
}) {
  const { storeId } = Route.useParams();
  return home ? (
    <Link to="/" {...props} />
  ) : (
    <Link
      to="/stores/$storeId"
      params={{ storeId }}
      search={{ stack, stage }}
      {...props}
    />
  );
}
