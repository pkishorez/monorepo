import { useCallback, useMemo } from 'react';
import { View } from '@kestack/kabuki/react';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  discoverAttributeKeys,
  discoverAttributeValues,
  SERVICE_ATTR_KEY,
  selectedServiceOf,
  servicesOf,
  tracesOf,
} from '../trace-model/index.js';
import { FeedLive, listingOf } from './actor.js';
import { ListFilters } from './ui/list-filters';
import { TraceFeed } from './ui/trace-feed';

/*
 * The Feed drawn: the search and Filters on top, the Traces below, with a
 * row to show those held back while a Trace is open and one to show more.
 */

export const FeedView = View.make(FeedLive, ({ root, model, props, send }) => {
  const { spans, filters } = model;
  const listing = listingOf(model, props.opened);
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
});
