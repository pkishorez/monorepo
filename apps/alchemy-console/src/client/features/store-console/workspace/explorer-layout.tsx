import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from 'kui-toolkit/components/ui/sidebar';
import { ChevronRight } from 'kui-toolkit/lucide';
import { StateTree, StateOverview } from '../state-browser/index.ts';
import { ResourceBrowser, ResourceDetails } from '../resource-browser/index.ts';
import { StageOutputs } from '../stage-outputs/index.ts';
import type { ExplorerLocation, NavigationLink } from '../state-view/index.ts';

export function StoreExplorer({
  storeId,
  storeName,
  stack,
  stage,
  resource,
  NavigationLink,
  StageAction,
  onNavigate,
  sidebarHeader,
  sidebarFooter,
}: ExplorerLocation & {
  storeId: string;
  storeName: string | null;
  NavigationLink: NavigationLink;
  StageAction: ComponentType<{ stack: string; stage: string }>;
  onNavigate: (location: ExplorerLocation) => void;
  sidebarHeader: ReactNode;
  sidebarFooter: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    document.title = [stage, stack, storeName, 'Alchemy Console']
      .filter(Boolean)
      .join(' · ');
  }, [stage, stack, storeName]);
  const showDetail =
    stack !== undefined && stage !== undefined && resource !== undefined;
  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="min-h-svh"
    >
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="p-2">{sidebarHeader}</SidebarHeader>
        <SidebarContent>
          <StateTree
            key={storeId}
            storeId={storeId}
            stack={stack}
            stage={stage}
            NavigationLink={NavigationLink}
          />
        </SidebarContent>
        <SidebarFooter className="border-t p-2">{sidebarFooter}</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Breadcrumb
            storeName={storeName}
            stack={stack}
            stage={stage}
            resource={resource}
            NavigationLink={NavigationLink}
          />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
              {stack === undefined || stage === undefined ? (
                <StateOverview
                  key={stack}
                  storeId={storeId}
                  stack={stack}
                  storeName={storeName}
                  NavigationLink={NavigationLink}
                  StageAction={StageAction}
                />
              ) : (
                <ResourceBrowser
                  key={`${stack}/${stage}`}
                  storeId={storeId}
                  stack={stack}
                  stage={stage}
                  resource={resource}
                  NavigationLink={NavigationLink}
                  StageAction={StageAction}
                  outputs={
                    <StageOutputs
                      key={`${stack}/${stage}`}
                      storeId={storeId}
                      stack={stack}
                      stage={stage}
                    />
                  }
                />
              )}
            </div>
          </div>
          {showDetail && (
            <ResourceDetails
              key={resource}
              storeId={storeId}
              stack={stack}
              stage={stage}
              resource={resource}
              NavigationLink={NavigationLink}
              onClose={() => onNavigate({ stack, stage })}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Breadcrumb({
  storeName,
  stack,
  stage,
  resource,
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
      current: resource === undefined,
      node:
        resource === undefined ? (
          stage
        ) : (
          <NavigationLink stack={stack} stage={stage} className={link}>
            {stage}
          </NavigationLink>
        ),
    });
  if (stack !== undefined && stage !== undefined && resource !== undefined)
    crumbs.push({
      key: 'resource',
      current: true,
      node: <span className="font-mono text-[13px]">{resource}</span>,
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
