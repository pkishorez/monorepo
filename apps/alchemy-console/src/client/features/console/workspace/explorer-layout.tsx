import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { AppShell, useAppShell } from '@kstackz/web-platform/recipes/frame';
import { ChevronRight } from '@kstackz/web-platform/components/lucide';
import { Logo, LogoMark } from '../../brand/index.ts';
import { StateTree, StateOverview } from '../explorer/index.ts';
import { ResourceBrowser } from '../resources/index.ts';
import type { ExplorerLocation, NavigationLink } from '../state-view/index.ts';

export function StoreExplorer({
  storeId,
  storeName,
  stack,
  stage,
  NavigationLink,
  StageAction,
  onStackDeleted,
  sidebarHeader,
  sidebarFooter,
}: ExplorerLocation & {
  storeId: string;
  storeName: string | null;
  NavigationLink: NavigationLink;
  StageAction: ComponentType<{ stack: string; stage: string }>;
  onStackDeleted: (stack: string) => void;
  sidebarHeader: ReactNode;
  sidebarFooter: ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(256);
  useEffect(() => {
    document.title = [stage, stack, storeName, 'Alchemy Console']
      .filter(Boolean)
      .join(' · ');
  }, [stage, stack, storeName]);
  return (
    <AppShell
      sidebar={{
        header: (
          <>
            <NavigationLink
              home
              title="Alchemy Console"
              className="flex h-8 items-center rounded-md px-2 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Logo />
            </NavigationLink>
            {sidebarHeader}
          </>
        ),
        content: (
          <StateTree
            key={storeId}
            storeId={storeId}
            stack={stack}
            stage={stage}
            NavigationLink={NavigationLink}
          />
        ),
        footer: sidebarFooter,
        width: sidebarWidth,
        onWidthChange: setSidebarWidth,
      }}
      header={{
        title: (
          <HeaderTitle
            storeName={storeName}
            stack={stack}
            stage={stage}
            NavigationLink={NavigationLink}
          />
        ),
      }}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {stack === undefined || stage === undefined ? (
          <StateOverview
            key={stack}
            storeId={storeId}
            stack={stack}
            storeName={storeName}
            NavigationLink={NavigationLink}
            StageAction={StageAction}
            onStackDeleted={onStackDeleted}
          />
        ) : (
          <ResourceBrowser
            key={`${stack}/${stage}`}
            storeId={storeId}
            stack={stack}
            stage={stage}
            StageAction={StageAction}
          />
        )}
      </div>
    </AppShell>
  );
}

// Where you are; with the sidebar shut, the logo leads it, as the way home.
function HeaderTitle(
  props: ExplorerLocation & {
    storeName: string | null;
    NavigationLink: NavigationLink;
  },
) {
  const { open } = useAppShell();
  return (
    <div className="flex min-w-0 items-center gap-2 font-normal">
      {!open && (
        <>
          <props.NavigationLink
            home
            title="Alchemy Console"
            className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LogoMark className="size-5" />
            <span className="sr-only">Alchemy Console</span>
          </props.NavigationLink>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
        </>
      )}
      <Breadcrumb {...props} />
    </div>
  );
}

function Breadcrumb({
  storeName,
  stack,
  stage,
  NavigationLink,
}: ExplorerLocation & {
  storeName: string | null;
  NavigationLink: NavigationLink;
}) {
  const link =
    'truncate rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  const crumbs: { key: string; node: ReactNode; current: boolean }[] = [
    {
      key: 'store',
      current: stack === undefined,
      node:
        stack === undefined ? (
          (storeName ?? 'Store')
        ) : (
          <NavigationLink className={link}>
            {storeName ?? 'Store'}
          </NavigationLink>
        ),
    },
  ];
  if (stack !== undefined)
    crumbs.push({
      key: 'stack',
      current: stage === undefined,
      node:
        stage === undefined ? (
          stack
        ) : (
          <NavigationLink stack={stack} className={link}>
            {stack}
          </NavigationLink>
        ),
    });
  if (stack !== undefined && stage !== undefined)
    crumbs.push({
      key: 'stage',
      current: true,
      node: stage,
    });
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li
            key={crumb.key}
            className={`flex min-w-0 items-center gap-1.5 ${index < crumbs.length - 1 ? 'hidden sm:flex' : ''} ${crumb.current ? 'text-foreground' : ''}`}
            aria-current={crumb.current ? 'page' : undefined}
          >
            {index > 0 && (
              <ChevronRight
                className="hidden size-3 shrink-0 sm:block"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 truncate">{crumb.node}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
