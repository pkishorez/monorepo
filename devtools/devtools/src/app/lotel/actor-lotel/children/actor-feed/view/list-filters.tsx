import { SearchIcon } from 'lucide-react';
import {
  formatServiceName,
  type Filters,
  type TraceStatusFilter,
} from '../logic/shared/index.js';
import { FilterControls, FilterPills, GroupByControl } from './filter-bar.js';

export function ListFilters({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  selectedService,
  onServiceChange,
  services,
  attributeKeys,
  getAttributeValues,
  groupBy,
  onGroupByChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  selectedService: string | null;
  onServiceChange: (value: string) => void;
  services: string[];
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
  groupBy: string | null;
  onGroupByChange: (next: string | null) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
      <label className="flex h-11 items-center gap-2 rounded-md border border-border bg-background px-3 md:h-8 md:px-2">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search traces"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
        />
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        <FilterControls
          filters={filters}
          onFiltersChange={onFiltersChange}
          attributeKeys={attributeKeys}
          getAttributeValues={getAttributeValues}
        />
        <GroupByControl
          value={groupBy}
          onChange={onGroupByChange}
          attributeKeys={attributeKeys}
        />
      </div>
      <FilterPills filters={filters} onFiltersChange={onFiltersChange} />
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Trace status"
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              status: event.target.value as TraceStatusFilter,
            })
          }
          className="h-11 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-xs"
        >
          <option value="all">All statuses</option>
          <option value="error">Errors</option>
          <option value="running">Running</option>
        </select>
        <select
          aria-label="Service"
          value={selectedService ?? ''}
          onChange={(event) => onServiceChange(event.target.value)}
          className="h-11 min-w-0 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-xs"
        >
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {formatServiceName(service)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
