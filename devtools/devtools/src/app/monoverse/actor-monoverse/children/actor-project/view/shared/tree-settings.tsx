import { useId, type ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { cn } from '@kestack/web-platform/ui/components/utils';

import {
  Segments,
  SettingRow,
  SettingsIcon,
  SettingsSheet,
  SettingSwitch,
  settingsTrigger,
} from './settings.js';
import { usePhone } from './screen.js';
import type { Unchanged } from '../../../../logic/shared/index.js';

export interface TreeSettingsProps {
  readonly changesOn: boolean;
  readonly unchanged: Unchanged;
  readonly deleted: boolean;
  readonly ignored: boolean;
  readonly onUnchanged: (unchanged: Unchanged) => void;
  readonly onDeleted: () => void;
  readonly onIgnored: () => void;
}

const unchangedChoices: ReadonlyArray<{
  value: Unchanged;
  label: string;
}> = [
  { value: 'show', label: 'Show' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

const ignoredHint = "A Package's files outside its source roots";

export function TreeSettingsRows({
  sheet,
  keep = false,
  ...props
}: TreeSettingsProps & {
  sheet: boolean;
  keep?: boolean;
}) {
  const divider = (
    <div
      aria-hidden
      className={cn('my-1 h-px bg-border/60', sheet ? 'mx-3' : 'mx-2')}
    />
  );
  const unchanged = (
    <Segments
      label="Unchanged files"
      value={props.unchanged}
      choices={unchangedChoices}
      onChange={props.onUnchanged}
    />
  );
  if (sheet)
    return (
      <>
        {props.changesOn ? (
          <>
            <SettingRow label="Unchanged files">{unchanged}</SettingRow>
            <SettingSwitch
              label="Deleted files"
              checked={props.deleted}
              onChange={props.onDeleted}
            />
            {divider}
          </>
        ) : null}
        <SettingSwitch
          label="Ignored files"
          hint={ignoredHint}
          checked={props.ignored}
          onChange={props.onIgnored}
        />
      </>
    );
  const changeRows = props.changesOn || keep;
  return (
    <>
      {changeRows ? (
        <div
          inert={!props.changesOn}
          title={props.changesOn ? undefined : 'Turn Changes on to choose'}
          className={cn(
            'transition-opacity duration-150',
            !props.changesOn && 'opacity-40',
          )}
        >
          <div className="flex items-center justify-between gap-3 px-2 py-1.5">
            <span className="text-sm">Unchanged</span>
            {unchanged}
          </div>
          <SwitchRow
            label="Deleted"
            title="Draw the files the branch deleted"
            checked={props.deleted}
            onChange={props.onDeleted}
          />
          {divider}
        </div>
      ) : null}
      <SwitchRow
        label="Ignored"
        title={ignoredHint}
        hint={ignoredHint}
        checked={props.ignored}
        onChange={props.onIgnored}
      />
    </>
  );
}

export function TreeSettings({
  icon,
  label = 'View settings',
  ...props
}: TreeSettingsProps & {
  icon?: ReactNode;
  label?: string;
}) {
  const phone = usePhone();
  if (phone)
    return (
      <SettingsSheet title={label} {...(icon === undefined ? {} : { icon })}>
        <TreeSettingsRows sheet {...props} />
      </SettingsSheet>
    );
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className={settingsTrigger}
      >
        {icon ?? <SettingsIcon />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-1">
        <TreeSettingsRows sheet={false} {...props} />
      </PopoverContent>
    </Popover>
  );
}

function SwitchRow({
  label,
  title,
  hint,
  checked,
  onChange,
}: {
  label: string;
  title: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      title={title}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors duration-150 select-none hover:bg-muted/70"
    >
      <span className="flex min-w-0 flex-col">
        {label}
        {hint === undefined ? null : (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
