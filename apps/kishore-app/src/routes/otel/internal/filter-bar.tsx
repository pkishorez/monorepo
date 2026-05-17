import { useState } from 'react';
import { ClockIcon, PlusIcon, XIcon } from '@monorepo/frontend/lucide';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@monorepo/frontend/components/ui/native-select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';
import type { Filters } from './use-filters';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function FilterPill({
  label,
  onClick,
  onRemove,
}: {
  label: string;
  onClick?: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="rounded-sm hover:text-foreground"
        >
          {label}
        </button>
      ) : (
        label
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="ml-0.5 size-3.5 text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-3" />
      </Button>
    </span>
  );
}

function AddAttributeFilter({
  attributeKeys,
  getAttributeValues,
  onAdd,
}: {
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
  onAdd: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const values = key ? getAttributeValues(key) : [];

  function handleAdd() {
    if (!key || !value) return;
    onAdd(key, value);
    setKey('');
    setValue('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(Boolean(next))}>
      <PopoverTrigger
        render={<Button variant="outline" size="xs" className="gap-1" />}
      >
        <PlusIcon className="size-3" />
        Filter
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-3 p-3">
        <div className="flex flex-col gap-2">
          <NativeSelect
            size="sm"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setValue('');
            }}
            className="w-full"
          >
            <NativeSelectOption value="">
              Select attribute...
            </NativeSelectOption>
            {attributeKeys.map((k) => (
              <NativeSelectOption key={k} value={k}>
                {k}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            size="sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!key || values.length === 0}
            className="w-full"
          >
            <NativeSelectOption value="">Select value...</NativeSelectOption>
            {values.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {v}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button size="xs" onClick={handleAdd} disabled={!key || !value}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterBarProps {
  serviceNames: string[];
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
  filters: Filters;
  onServiceChange: (name: string | null) => void;
  onSinceNow: () => void;
  onClearSinceNow: () => void;
  onAddAttributeFilter: (key: string, value: string) => void;
  onRemoveAttributeFilter: (id: string) => void;
}

export function FilterBar({
  serviceNames,
  attributeKeys,
  getAttributeValues,
  filters,
  onServiceChange,
  onSinceNow,
  onClearSinceNow,
  onAddAttributeFilter,
  onRemoveAttributeFilter,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-muted-foreground">Service</span>
        <NativeSelect
          size="sm"
          value={filters.serviceName ?? ''}
          onChange={(e) => onServiceChange(e.target.value || null)}
        >
          <NativeSelectOption value="">All</NativeSelectOption>
          {serviceNames.map((n) => (
            <NativeSelectOption key={n} value={n}>
              {n}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {filters.attributeFilters.map((f) => (
        <FilterPill
          key={f.id}
          label={`${f.key}=${f.value}`}
          onRemove={() => onRemoveAttributeFilter(f.id)}
        />
      ))}

      {attributeKeys.length > 0 && (
        <AddAttributeFilter
          attributeKeys={attributeKeys}
          getAttributeValues={getAttributeValues}
          onAdd={onAddAttributeFilter}
        />
      )}

      {filters.sinceNow !== null ? (
        <FilterPill
          label={`since ${formatTime(filters.sinceNow)}`}
          onClick={onSinceNow}
          onRemove={onClearSinceNow}
        />
      ) : (
        <Button
          variant="outline"
          size="xs"
          className="gap-1"
          onClick={onSinceNow}
        >
          <ClockIcon className="size-3" />
          Since now
        </Button>
      )}
    </div>
  );
}
