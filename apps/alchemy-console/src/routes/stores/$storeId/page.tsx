import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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
  const { storeId } = Route.useParams();
  const { stack, stage } = Route.useSearch();
  return (
    <StoreExplorer
      key={storeId}
      storeId={storeId}
      stack={stack}
      stage={stage}
      NavigationLink={NavigationLink}
    />
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
