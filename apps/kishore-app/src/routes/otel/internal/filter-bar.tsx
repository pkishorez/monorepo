import { useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ClockIcon,
  LayersIcon,
  PlusIcon,
  XIcon,
} from '@monorepo/frontend/lucide';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@monorepo/frontend/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';
import { serviceColor } from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import { cn } from '@monorepo/frontend/lib/utils';
import {
  formatServiceName,
  GROUP_BY_TRACE_NAME,
  NO_ROOT_SERVICE,
  SERVICE_ATTR_KEY,
  type ServiceOption,
} from './filters';
import type { AttributeFilter, Filters } from './store';

interface ControlsProps {
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
}

export function FilterControls({
  filters,
  onFiltersChange,
  attributeKeys,
  getAttributeValues,
}: ControlsProps) {
  function addFilter(key: string, value: string) {
    const exists = filters.attributeFilters.some(
      (f) => f.key === key && f.value === value,
    );
    if (exists) return;
    onFiltersChange({
      ...filters,
      attributeFilters: [
        ...filters.attributeFilters,
        { id: crypto.randomUUID(), key, value },
      ],
    });
  }

  function toggleSinceNow() {
    onFiltersChange({
      ...filters,
      sinceNow: filters.sinceNow === null ? Date.now() : null,
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <AddFilterPicker
        attributeKeys={attributeKeys}
        getAttributeValues={getAttributeValues}
        onAdd={addFilter}
      />
      <Button
        variant={filters.sinceNow !== null ? 'default' : 'outline'}
        size="xs"
        className="gap-1"
        onClick={toggleSinceNow}
      >
        <ClockIcon className="size-3" />
        Since now
      </Button>
    </div>
  );
}

interface PillsProps {
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
}

export function FilterPills({ filters, onFiltersChange }: PillsProps) {
  const nonServicePills = filters.attributeFilters.filter(
    (f) => f.key !== SERVICE_ATTR_KEY,
  );

  if (nonServicePills.length === 0 && filters.sinceNow === null) {
    return null;
  }

  function removeFilter(id: string) {
    onFiltersChange({
      ...filters,
      attributeFilters: filters.attributeFilters.filter((f) => f.id !== id),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nonServicePills.map((f) => (
        <FilterPill key={f.id} filter={f} onRemove={() => removeFilter(f.id)} />
      ))}
      {filters.sinceNow !== null && (
        <SinceNowPill
          ts={filters.sinceNow}
          onRemove={() => onFiltersChange({ ...filters, sinceNow: null })}
        />
      )}
    </div>
  );
}

interface ServiceFilterProps {
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  options: ServiceOption[];
}

export function ServiceFilter({
  filters,
  onFiltersChange,
  options,
}: ServiceFilterProps) {
  const [open, setOpen] = useState(false);

  const selected =
    filters.attributeFilters.find((f) => f.key === SERVICE_ATTR_KEY)?.value ??
    null;

  function setService(name: string | null) {
    const withoutService = filters.attributeFilters.filter(
      (f) => f.key !== SERVICE_ATTR_KEY,
    );
    onFiltersChange({
      ...filters,
      attributeFilters:
        name === null
          ? withoutService
          : [
              ...withoutService,
              { id: crypto.randomUUID(), key: SERVICE_ATTR_KEY, value: name },
            ],
    });
  }

  const selectedColor =
    selected && selected !== NO_ROOT_SERVICE ? serviceColor(selected) : null;

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="xs"
              className={cn('gap-1.5', selected && 'rounded-r-none')}
            >
              {selectedColor ? (
                <span
                  className={cn('size-1.5 rounded-full', selectedColor.dot)}
                />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              )}
              <span className="font-mono">
                {selected ? formatServiceName(selected) : 'No service selected'}
              </span>
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-64 p-0">
          <Command shouldFilter>
            <CommandInput placeholder="Search services..." autoFocus />
            <CommandList>
              <CommandEmpty>No services.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const isNoRoot = o.name === NO_ROOT_SERVICE;
                  const c = isNoRoot ? null : serviceColor(o.name);
                  const disabled = o.count === 0;
                  return (
                    <CommandItem
                      key={o.name}
                      value={o.name}
                      disabled={disabled}
                      onSelect={() => {
                        if (disabled) return;
                        setService(o.name);
                        setOpen(false);
                      }}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          c ? c.dot : 'bg-muted-foreground/40',
                        )}
                      />
                      <span className="flex-1 truncate font-mono text-xs">
                        {formatServiceName(o.name)}
                      </span>
                      <span className="tabular-nums text-[10px] text-muted-foreground">
                        {o.count}
                      </span>
                      {selected === o.name && (
                        <CheckIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setService(null)}
          aria-label="Clear service filter"
          className="-ml-px gap-0 rounded-l-none border-l-0 px-1.5"
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}

function FilterPill({
  filter,
  onRemove,
}: {
  filter: AttributeFilter;
  onRemove: () => void;
}) {
  const isService = filter.key === SERVICE_ATTR_KEY;
  const color =
    isService && filter.value !== NO_ROOT_SERVICE
      ? serviceColor(filter.value)
      : null;
  const keyLabel = isService ? 'service' : filter.key;
  const valueLabel = isService ? formatServiceName(filter.value) : filter.value;

  return (
    <span
      className={cn(
        'group/pill inline-flex h-6 items-center rounded-md text-xs',
        'bg-muted/60 ring-1 ring-inset ring-border/60',
      )}
    >
      <span className="flex items-center gap-1.5 pl-2 pr-1.5 text-muted-foreground">
        {color && <span className={cn('size-1.5 rounded-full', color.dot)} />}
        <span className="font-mono">{keyLabel}</span>
      </span>
      <span className="text-muted-foreground/40">:</span>
      <span className="px-1.5 font-mono text-foreground">{valueLabel}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${keyLabel} ${filter.value}`}
        className={cn(
          'mr-0.5 flex size-4 items-center justify-center rounded-sm',
          'text-muted-foreground/60 transition-colors',
          'hover:bg-muted hover:text-foreground',
        )}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function SinceNowPill({ ts, onRemove }: { ts: number; onRemove: () => void }) {
  return (
    <span
      className={cn(
        'group/pill inline-flex h-6 items-center rounded-md text-xs',
        'bg-muted/60 ring-1 ring-inset ring-border/60',
      )}
    >
      <span className="flex items-center gap-1.5 pl-2 pr-1.5 text-muted-foreground">
        <ClockIcon className="size-3" />
        <span className="font-mono">since</span>
      </span>
      <span className="text-muted-foreground/40">:</span>
      <span className="px-1.5 font-mono text-foreground">
        {new Date(ts).toLocaleTimeString()}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove since-now filter"
        className="mr-0.5 flex size-4 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function AddFilterPicker({
  attributeKeys,
  getAttributeValues,
  onAdd,
}: {
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
  onAdd: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<
    { kind: 'key' } | { kind: 'value'; key: string }
  >({ kind: 'key' });
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const stageRef = useRef(stage);
  stageRef.current = stage;

  function closePopover() {
    setOpen(false);
    setStage({ kind: 'key' });
    setQuery('');
  }

  function handleOpenChange(
    next: boolean,
    details: { reason: string; cancel: () => void },
  ) {
    const isEscape =
      details.reason === 'escape-key' || details.reason === 'close-watcher';
    if (!next && isEscape && stageRef.current.kind === 'value') {
      details.cancel();
      goBack();
      return;
    }
    if (next) {
      setOpen(true);
    } else {
      closePopover();
    }
  }

  function pickKey(key: string) {
    setStage({ kind: 'value', key });
    setQuery('');
    queueMicrotask(() => inputRef.current?.focus());
  }

  function pickValue(value: string) {
    if (stage.kind !== 'value') return;
    onAdd(stage.key, value);
    closePopover();
  }

  function goBack() {
    setStage({ kind: 'key' });
    setQuery('');
    queueMicrotask(() => inputRef.current?.focus());
  }

  const hasService = attributeKeys.includes(SERVICE_ATTR_KEY);
  const orderedKeys = hasService
    ? [SERVICE_ATTR_KEY, ...attributeKeys.filter((k) => k !== SERVICE_ATTR_KEY)]
    : attributeKeys;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="xs" className="gap-1">
            <PlusIcon className="size-3" />
            Filter
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          {stage.kind === 'value' && (
            <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={goBack}
                aria-label="Back"
                className="size-5"
              >
                <ChevronLeftIcon className="size-3.5" />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {stage.key === SERVICE_ATTR_KEY ? 'service' : stage.key}
              </span>
            </div>
          )}
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={
              stage.kind === 'key' ? 'Filter by...' : 'Search values...'
            }
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (stageRef.current.kind === 'value') {
                  e.preventDefault();
                  e.stopPropagation();
                  goBack();
                } else {
                  e.preventDefault();
                  e.stopPropagation();
                  closePopover();
                }
              }
            }}
          />
          <CommandList>
            {stage.kind === 'key' ? (
              <>
                <CommandEmpty>No attributes.</CommandEmpty>
                <CommandGroup>
                  {orderedKeys.map((k) => (
                    <CommandItem key={k} value={k} onSelect={() => pickKey(k)}>
                      <span className="font-mono text-xs">
                        {k === SERVICE_ATTR_KEY ? 'service' : k}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : (
              <>
                <CommandEmpty>No values.</CommandEmpty>
                <CommandGroup>
                  {getAttributeValues(stage.key).map((v) => (
                    <CommandItem
                      key={v}
                      value={v}
                      onSelect={() => pickValue(v)}
                    >
                      <span className="font-mono text-xs">{v}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface GroupByControlProps {
  value: string | null;
  onChange: (next: string | null) => void;
  attributeKeys: string[];
}

export function GroupByControl({
  value,
  onChange,
  attributeKeys,
}: GroupByControlProps) {
  const [open, setOpen] = useState(false);
  const lastRef = useRef<string>(value ?? GROUP_BY_TRACE_NAME);
  if (value) lastRef.current = value;

  const enabled = value !== null;

  function toggle() {
    onChange(enabled ? null : lastRef.current);
  }

  function pick(next: string) {
    lastRef.current = next;
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5 rounded-r-none"
            >
              <span
                className={cn('text-xs', !enabled && 'text-muted-foreground')}
              >
                Group by: {labelFor(value ?? lastRef.current)}
              </span>
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-56 p-0">
          <Command shouldFilter>
            <CommandInput placeholder="Group by..." autoFocus />
            <CommandList>
              <CommandEmpty>No attributes.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="trace name"
                  onSelect={() => pick(GROUP_BY_TRACE_NAME)}
                >
                  <span className="flex-1 font-mono text-xs">Trace name</span>
                  {value === GROUP_BY_TRACE_NAME && (
                    <CheckIcon className="size-3.5 text-muted-foreground" />
                  )}
                </CommandItem>
                {attributeKeys.map((k) => (
                  <CommandItem key={k} value={k} onSelect={() => pick(k)}>
                    <span className="flex-1 truncate font-mono text-xs">
                      {k}
                    </span>
                    {value === k && (
                      <CheckIcon className="size-3.5 text-muted-foreground" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        variant={enabled ? 'default' : 'outline'}
        size="xs"
        onClick={toggle}
        aria-pressed={enabled}
        aria-label="Toggle grouping"
        className="-ml-px rounded-l-none px-1.5"
      >
        <LayersIcon className="size-3" />
      </Button>
    </div>
  );
}

function labelFor(key: string | null): string {
  if (key === null) return 'Off';
  if (key === GROUP_BY_TRACE_NAME) return 'Trace name';
  return key;
}
