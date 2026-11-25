import { useId, type ReactNode } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@kestack/web-platform/ui/components/drawer';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { SlidersHorizontalIcon } from 'lucide-react';

export const settingsTrigger = cn(
  'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 outline-none',
  'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-muted max-sm:size-11',
);

export function SettingsIcon() {
  return <SlidersHorizontalIcon className="size-4" />;
}

export function SettingsSheet({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Drawer>
      <DrawerTrigger
        aria-label={title}
        title={title}
        className={settingsTrigger}
      >
        {icon ?? <SettingsIcon />}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="pb-1">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-lg px-3 py-1.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm">{label}</span>
        {hint === undefined ? null : (
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </div>
  );
}

export function SettingSwitch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-12 items-center justify-between gap-4 rounded-lg px-3 py-1.5 transition-colors duration-150 select-none',
        disabled ? 'opacity-50' : 'cursor-pointer active:bg-muted/70',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-sm">{label}</span>
        {hint === undefined ? null : (
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      <Switch
        id={id}
        checked={checked}
        {...(disabled === undefined ? {} : { disabled })}
        onCheckedChange={onChange}
      />
    </label>
  );
}

export function Segments<Value extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: Value;
  choices: ReadonlyArray<{ readonly value: Value; readonly label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md bg-muted/70 p-0.5"
    >
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          onClick={() => onChange(choice.value)}
          className={cn(
            'h-6 rounded-[5px] px-2 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-sm:h-9 max-sm:px-3 max-sm:text-[13px]',
            value === choice.value
              ? 'bg-background text-foreground shadow-[0_0_0_1px_var(--color-border),0_1px_2px_rgb(0_0_0/0.08)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
