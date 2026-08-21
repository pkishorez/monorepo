import { Check, ChevronDown, Database } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@monorepo/frontend/components/ui/dropdown-menu';
import { cn } from '@monorepo/frontend/lib/utils';

export interface StoreOption {
  readonly value: string;
  readonly label: string;
}

export function StoreToggle({
  stores,
  store,
  onChange,
}: {
  stores: readonly StoreOption[];
  store: string;
  onChange: (value: string) => void;
}) {
  const current = stores.find((option) => option.value === store) ?? stores[0];
  if (current === undefined) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Store: ${current.label}`}
            className="h-8 shrink-0 gap-1.5 px-2.5 font-normal"
          />
        }
      >
        <Database className="size-3.5 text-muted-foreground" />
        <span className="text-xs">{current.label}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Keep accounts in</DropdownMenuLabel>
          {stores.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
              <Check
                className={cn(
                  'ml-auto size-4',
                  option.value === current.value ? 'opacity-100' : 'opacity-0',
                )}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
