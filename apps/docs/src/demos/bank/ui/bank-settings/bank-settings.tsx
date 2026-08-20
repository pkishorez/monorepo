import { Settings2 } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';

export interface SettingOption {
  readonly value: string;
  readonly label: string;
}

export function BankSettings({
  networks,
  network,
  onNetworkChange,
}: {
  networks: readonly SettingOption[];
  network: string;
  onNetworkChange: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bank settings"
            className="size-8 shrink-0 text-muted-foreground"
          />
        }
      >
        <Settings2 className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-56 gap-1.5 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium">Network</span>
          <span className="text-xs text-muted-foreground">
            how the bank answers
          </span>
        </div>
        <Select
          value={network}
          onValueChange={(next) => onNetworkChange(next ?? network)}
          items={networks.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {networks.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}
