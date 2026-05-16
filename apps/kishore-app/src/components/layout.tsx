import { useTheme } from '@/components/theme';
import { FileRoutesByFullPath } from '@/routeTree.gen';
import { Button } from '@monorepo/frontend/components/ui/button';
import { ArrowLeft, SunIcon } from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import { ClientOnly, Link, Outlet } from '@tanstack/react-router';

export function Layout({
  children = (
    <ClientOnly>
      <Outlet />
    </ClientOnly>
  ),
  left,
}: {
  left?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { toggleTheme } = useTheme();

  return (
    <div>
      <div
        className={cn(
          'h-16 shadow-md p-2 border-b border-border/25 flex items-center justify-between',
          'fixed top-0 left-0 right-0 z-10',
          'bg-background/30 backdrop-blur-lg',
        )}
      >
        <div>{left}</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={toggleTheme}>
            <SunIcon />
          </Button>
        </div>
      </div>
      <div className="pt-16">{children}</div>
    </div>
  );
}

export function Back({ to }: { to: keyof FileRoutesByFullPath }) {
  return (
    <Link to={to as any}>
      <Button variant="ghost">
        <ArrowLeft />
      </Button>
    </Link>
  );
}
