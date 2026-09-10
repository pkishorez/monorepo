import { useCallback } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useQueryClient } from 'use-effect-ts/query';
import {
  StoreLanding,
  StoreList,
  StoreSwitcher,
  useStore,
} from '../store-management/index.ts';
import { DeleteStage } from '../stage-deletion/index.ts';
import { refreshStoreState } from '../store-query/index.ts';
import type { ExplorerLocation, NavigationLink } from '../state-view/index.ts';
import { StoreExplorer } from './explorer-layout.tsx';

export type { ExplorerLocation } from '../state-view/index.ts';
type StoreLink = ComponentType<{
  storeId: string;
  className?: string;
  children?: ReactNode;
}>;
type ExploreProps = ExplorerLocation & {
  mode: 'explore';
  storeId: string;
  StoreLink: StoreLink;
  ManageLink: ComponentType<{ className?: string; children?: ReactNode }>;
  NavigationLink: NavigationLink;
  onNavigate: (location: ExplorerLocation) => void;
  onStoreCreated: (storeId: string) => void;
  onBusyChange: (busy: boolean) => void;
  sidebarFooter: ReactNode;
};

export function Workspace(
  props:
    | ExploreProps
    | {
        mode: 'landing' | 'management';
        StoreLink: StoreLink;
        onStoreCreated: (storeId: string) => void;
      },
) {
  if (props.mode === 'explore')
    return <ExploreWorkspace key={props.storeId} {...props} />;
  if (props.mode === 'landing')
    return (
      <StoreLanding
        StoreLink={props.StoreLink}
        onStoreCreated={props.onStoreCreated}
      />
    );
  return (
    <StoreList
      StoreLink={props.StoreLink}
      onStoreCreated={props.onStoreCreated}
    />
  );
}

function ExploreWorkspace({
  storeId,
  stack,
  stage,
  StoreLink,
  ManageLink,
  NavigationLink,
  onNavigate,
  onStoreCreated,
  onBusyChange,
  sidebarFooter,
}: ExploreProps) {
  const store = useStore(storeId);
  const client = useQueryClient();
  const refresh = useCallback(() => {
    void refreshStoreState(client, storeId);
  }, [client, storeId]);
  return (
    <DeleteStage
      storeId={storeId}
      admin={store?.access === 'admin'}
      onBusyChange={onBusyChange}
      onSettled={refresh}
      onDeleted={(deleted) => {
        if (stack === deleted.stack && stage === deleted.stage)
          onNavigate({ stack });
      }}
    >
      {(StageAction) => (
        <StoreExplorer
          storeId={storeId}
          storeName={store?.name ?? null}
          stack={stack}
          stage={stage}
          NavigationLink={NavigationLink}
          StageAction={StageAction}
          sidebarHeader={
            <StoreSwitcher
              storeId={storeId}
              StoreLink={StoreLink}
              ManageLink={ManageLink}
              onStoreCreated={onStoreCreated}
            />
          }
          sidebarFooter={sidebarFooter}
        />
      )}
    </DeleteStage>
  );
}
