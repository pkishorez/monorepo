import { Effect, Semaphore } from 'effect';
import { useState } from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from 'kui-toolkit/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'kui-toolkit/components/ui/collapsible';
import { ChevronRight, Layers, Search } from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import type { NavigationLink } from './explorer-view.tsx';

const expandAllBelow = 15;

export function ExplorerTree({
  storeId,
  stack,
  stage,
  NavigationLink,
}: {
  storeId: string;
  stack?: string;
  stage?: string;
  NavigationLink: NavigationLink;
}) {
  const [filter, setFilter] = useState('');
  const [slots] = useState(() => Semaphore.makeUnsafe(4));
  const stacks = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStacks']({ storeId }),
    ),
    rpcQueryKeys.stacks(storeId),
  );
  const names = stacks.data?.data ?? [];
  const needle = filter.trim().toLocaleLowerCase();
  return (
    <>
      <SidebarGroup className="pb-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            aria-label="Filter stacks and stages"
            placeholder="Filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-7"
          />
        </div>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>
          Stacks
          {stacks.data && (
            <span className="ml-auto tabular-nums">{names.length}</span>
          )}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {stacks.pending && !stacks.data && (
              <>
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
                <SidebarMenuSkeleton showIcon />
              </>
            )}
            {stacks.error && !stacks.data && (
              <li className="px-2 py-1.5 text-xs text-destructive">
                {stacks.error}
              </li>
            )}
            {stacks.data && names.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                Nothing deployed here yet.
              </li>
            )}
            {names.map((name) => (
              <StackNode
                key={name}
                storeId={storeId}
                name={name}
                active={stack === name}
                activeStage={stack === name ? stage : undefined}
                needle={needle}
                defaultOpen={names.length <= expandAllBelow || stack === name}
                slots={slots}
                NavigationLink={NavigationLink}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

function StackNode({
  storeId,
  name,
  active,
  activeStage,
  needle,
  defaultOpen,
  slots,
  NavigationLink,
}: {
  storeId: string;
  name: string;
  active: boolean;
  activeStage?: string;
  needle: string;
  defaultOpen: boolean;
  slots: Semaphore.Semaphore;
  NavigationLink: NavigationLink;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { isMobile, setOpenMobile } = useSidebar();
  const stages = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStages']({ storeId, stack: name }),
    ).pipe(slots.withPermits(1)),
    rpcQueryKeys.stages(storeId, name),
  );
  const stageNames = stages.data?.data ?? [];
  const stackMatches = name.toLocaleLowerCase().includes(needle);
  const visibleStages = needle
    ? stageNames.filter(
        (stageName) =>
          stackMatches || stageName.toLocaleLowerCase().includes(needle),
      )
    : stageNames;
  if (needle && !stackMatches && visibleStages.length === 0) return null;
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Collapsible
      open={open || (needle.length > 0 && !stackMatches)}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <div className="flex items-center">
        <CollapsibleTrigger
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
        >
          <ChevronRight
            className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
        </CollapsibleTrigger>
        <SidebarMenuButton
          isActive={active && activeStage === undefined}
          className="h-7 min-w-0 flex-1 px-1.5"
          render={
            <NavigationLink stack={name} title={name} onClick={closeOnMobile} />
          }
        >
          <Layers className="size-3.5 text-muted-foreground" />
          <span className="truncate">{name}</span>
          {stages.data && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {stageNames.length}
            </span>
          )}
        </SidebarMenuButton>
      </div>
      <CollapsibleContent>
        <SidebarMenuSub className="ml-3.5 mr-0 pr-0">
          {stages.pending && !stages.data && (
            <SidebarMenuSubItem>
              <span className="block h-6 w-24 rounded-sm bg-sidebar-accent motion-safe:animate-pulse" />
            </SidebarMenuSubItem>
          )}
          {stages.data && stageNames.length === 0 && (
            <SidebarMenuSubItem className="px-2 py-1 text-xs text-muted-foreground">
              No stages
            </SidebarMenuSubItem>
          )}
          {visibleStages.map((stageName) => (
            <SidebarMenuSubItem key={stageName}>
              <SidebarMenuSubButton
                isActive={active && activeStage === stageName}
                render={
                  <NavigationLink
                    stack={name}
                    stage={stageName}
                    title={stageName}
                    onClick={closeOnMobile}
                  />
                }
              >
                <span className="truncate">{stageName}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
