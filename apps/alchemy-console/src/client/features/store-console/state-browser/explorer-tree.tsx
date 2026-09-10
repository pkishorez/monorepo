import { Effect, Semaphore } from 'effect';
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
} from 'kui-toolkit/components/ui/collapsible';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Layers,
  Search,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../store-query/index.ts';
import type { NavigationLink } from '../state-view/index.ts';
import type { namesView } from '../../../../shared/contracts/state-address/index.ts';

// Sized so its icon sits in the same column as the chevron inside each stack row.
const chevronButton =
  'mr-1 grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function ExplorerTree({
  storeId,
  stack,
  stage,
  NavigationLink,
  filter,
  onFilterChange,
  expanded,
  onExpandedChange,
  slots,
  stacks,
}: {
  storeId: string;
  stack?: string;
  stage?: string;
  NavigationLink: NavigationLink;
  filter: string;
  onFilterChange: (value: string) => void;
  expanded: ReadonlySet<string>;
  onExpandedChange: (value: ReadonlySet<string>) => void;
  slots: Semaphore.Semaphore;
  stacks: {
    data: typeof namesView.Type | null;
    pending: boolean;
    error: string | null;
    refresh: () => void;
  };
}) {
  const names = stacks.data?.data ?? [];
  const needle = filter.trim().toLocaleLowerCase();
  const allOpen = names.length > 0 && names.every((name) => expanded.has(name));
  const setOpen = (name: string, open: boolean) => {
    const next = new Set(expanded);
    if (open) next.add(name);
    else next.delete(name);
    onExpandedChange(next);
  };
  return (
    <>
      <SidebarGroup className="pb-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            aria-label="Filter stacks and stages"
            placeholder="Filter"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            className="pl-7"
          />
        </div>
      </SidebarGroup>
      <SidebarGroup>
        <div className="flex items-center">
          <SidebarGroupLabel className="flex-1">Stacks</SidebarGroupLabel>
          {names.length > 0 && (
            <button
              type="button"
              className={chevronButton}
              title={allOpen ? 'Collapse all stacks' : 'Expand all stacks'}
              aria-label={allOpen ? 'Collapse all stacks' : 'Expand all stacks'}
              onClick={() => onExpandedChange(new Set(allOpen ? [] : names))}
            >
              {allOpen ? (
                <ChevronsDownUp className="size-3.5" />
              ) : (
                <ChevronsUpDown className="size-3.5" />
              )}
            </button>
          )}
        </div>
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
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={stacks.refresh}
                >
                  Retry
                </button>
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
                open={expanded.has(name)}
                onOpenChange={(open) => setOpen(name, open)}
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
  slots,
  NavigationLink,
  open,
  onOpenChange,
}: {
  storeId: string;
  name: string;
  active: boolean;
  activeStage?: string;
  needle: string;
  slots: Semaphore.Semaphore;
  NavigationLink: NavigationLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      open={open}
      onOpenChange={onOpenChange}
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        isActive={active && activeStage === undefined}
        className="h-10 min-w-0 pl-2.5 pr-[15px] transition-colors duration-150"
        aria-expanded={open}
        render={
          <NavigationLink
            stack={name}
            title={name}
            onClick={() => {
              onOpenChange(!open);
              closeOnMobile();
            }}
          />
        }
      >
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <ChevronRight
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </SidebarMenuButton>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden motion-safe:transition-[height,opacity] motion-safe:duration-200 data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0">
        <SidebarMenuSub className="ml-4 mr-0 mt-1 gap-0.5 pr-0">
          {stages.pending && !stages.data && (
            <SidebarMenuSubItem>
              <span
                role="status"
                className="block px-2 py-1 text-xs text-muted-foreground motion-safe:animate-pulse"
              >
                Loading stages…
              </span>
            </SidebarMenuSubItem>
          )}
          {stages.data && stageNames.length === 0 && (
            <SidebarMenuSubItem className="px-2 py-1 text-xs text-muted-foreground">
              No stages
            </SidebarMenuSubItem>
          )}
          {stages.error && (
            <SidebarMenuSubItem className="px-2 py-1 text-xs text-destructive">
              <p role="alert">{stages.error}</p>
              <button
                type="button"
                className="underline"
                onClick={stages.refresh}
              >
                Retry
              </button>
            </SidebarMenuSubItem>
          )}
          {visibleStages.map((stageName) => (
            <SidebarMenuSubItem key={stageName}>
              <SidebarMenuSubButton
                className="h-8 rounded-md pl-3"
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
