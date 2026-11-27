import type { ReactElement, ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/ui/components/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';

export function Picker({
  trigger,
  label,
  items,
  placeholder,
  onPick,
}: {
  readonly trigger: ReactElement;
  readonly label: ReactNode;
  readonly placeholder: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly hint: string;
    readonly checked: boolean;
  }>;
  readonly onPick?: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={trigger}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.hint}`}
                  data-checked={item.checked}
                  onSelect={() => onPick?.(item.id)}
                  className="text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.hint}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
