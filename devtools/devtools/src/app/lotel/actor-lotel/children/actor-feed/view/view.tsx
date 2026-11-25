import { useCallback, useMemo } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  discoverAttributeKeys,
  discoverAttributeValues,
  SERVICE_ATTR_KEY,
  selectedServiceOf,
  servicesOf,
  tracesOf,
  listingOf,
} from '../logic/shared/index.js';
import type { FeedShape } from '../logic/shared/index.js';
import { ListFilters } from './list-filters.js';
import { TraceFeed } from './trace-feed.js';

export function Body({
  root,
  model,
  state,
  props,
  send,
}: ViewPropsOf<typeof FeedShape>) {
  const { spans, filters } = model;
  const listing = listingOf({ model, state, props });
  const attributeKeys = useMemo(() => discoverAttributeKeys(spans), [spans]);
  const getAttributeValues = useCallback(
    (key: string) => discoverAttributeValues(spans, key),
    [spans],
  );
  const services = useMemo(() => servicesOf(tracesOf(spans)), [spans]);

  const setService = (service: string) => {
    const withoutService = filters.attributeFilters.filter(
      (filter) => filter.key !== SERVICE_ATTR_KEY,
    );
    send({
      _tag: 'Filtered',
      filters: {
        ...filters,
        attributeFilters: service
          ? [
              ...withoutService,
              {
                id: crypto.randomUUID(),
                key: SERVICE_ATTR_KEY,
                value: service,
              },
            ]
          : withoutService,
      },
    });
  };

  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ListFilters
        search={model.search}
        onSearchChange={(search) => send({ _tag: 'Searched', search })}
        filters={filters}
        onFiltersChange={(next) => send({ _tag: 'Filtered', filters: next })}
        selectedService={selectedServiceOf(filters)}
        onServiceChange={setService}
        services={services}
        attributeKeys={attributeKeys}
        getAttributeValues={getAttributeValues}
        groupBy={model.groupBy}
        onGroupByChange={(groupBy) => send({ _tag: 'Grouped', groupBy })}
      />
      <div className={cn('min-h-0 flex-1 overflow-auto', scrollbarStyles)}>
        <TraceFeed
          traces={listing.traces}
          allSpans={spans}
          selectedTraceId={props.opened}
          groupBy={model.groupBy}
          expandedGroups={model.expanded}
          newCount={listing.held}
          hasMore={listing.hasMore}
          onRevealNew={() => send({ _tag: 'Revealed' })}
          onShowMore={() => send({ _tag: 'ShowedMore' })}
          onSelectTrace={(trace) =>
            send({ _tag: 'Picked', traceId: trace.traceId })
          }
          onToggleGroup={(group) => send({ _tag: 'Toggled', group })}
        />
      </div>
    </div>
  );
}
