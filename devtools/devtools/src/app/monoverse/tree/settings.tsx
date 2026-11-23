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
  usePhone,
} from '../ui/index.js';
import type { Unchanged } from './actor.js';

/*
 * What a file tree draws, the same wherever one is drawn, the tree or a
 * folder looked into: a Package's ignored files, and while Changes is on,
 * what the branch left unchanged (shown, dimmed or hidden) and what it
 * deleted. Compact rows in a popover on a wide screen; a thumb's height
 * each in a phone's sheet.
 */

export interface TreeSettingsProps {
  /** Changes is on: what it left unchanged and deleted can be chosen. */
  readonly changesOn: boolean;
  readonly unchanged: Unchanged;
  readonly deleted: boolean;
  readonly ignored: boolean;
  readonly onUnchanged: (unchanged: Unchanged) => void;
  readonly onDeleted: () => void;
  readonly onIgnored: () => void;
}

/** The three ways what the branch left unchanged is drawn, as offered. */
export const unchangedChoices: ReadonlyArray<{
  value: Unchanged;
  label: string;
}> = [
  { value: 'show', label: 'Show' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

/** What an ignored file is, in a few words. */
export const ignoredHint = "A Package's files outside its source roots";

/** The settings as rows: compact for a popover, a thumb's height each for a sheet. */
export function TreeSettingsRows({
  sheet,
  keep = false,
  ...props
}: TreeSettingsProps & {
  sheet: boolean;
  /**
   * Always drawn, as in a side panel: while Changes is off its own rows
   * stay, greyed and out of reach, so nothing below them moves.
   */
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

/** The settings behind the sliders: a popover on a wide screen, a sheet on a phone. */
export function TreeSettings({
  icon,
  label = 'View settings',
  ...props
}: TreeSettingsProps & {
  /** What the button shows in place of the sliders: a spinner, say. */
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

/** One switch, its label the whole row. */
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
