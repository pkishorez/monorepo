import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kestack/web-platform/ui/components/dropdown-menu';
import { cn } from '@kestack/web-platform/ui/components/utils';

import {
  SettingsIcon,
  SettingsSheet,
  SettingSwitch,
  settingsTrigger,
  usePhone,
} from '../ui/index.js';
import { setDiffOptions, useDiffOptions } from './diff-options.js';

/*
 * How a diff reads, in one menu: every folded region open or not, long
 * lines wrapped, one column or two (a phone always reads one); and in a
 * folder, whether the deleted files are listed. A dropdown on a wide
 * screen; on a phone, the settings sheet.
 */

export function ViewOptions({
  diff,
  deleted,
  className,
}: {
  /** Offer what a diff reads by. */
  diff: boolean;
  /** In a folder with deleted files: whether they are listed, and how to change it. */
  deleted?: { readonly shown: boolean; readonly onToggle: () => void };
  className?: string;
}) {
  const options = useDiffOptions();
  const phone = usePhone();
  if (!diff && deleted === undefined) return null;
  if (phone)
    return (
      <span className={cn('contents', className)}>
        <SettingsSheet title="View options">
          {diff ? (
            <>
              <SettingSwitch
                label="Expand all"
                hint="Every unchanged region open"
                checked={options.expandAll}
                onChange={(expandAll) => setDiffOptions({ expandAll })}
              />
              <SettingSwitch
                label="Wrap lines"
                checked={options.wrap}
                onChange={(wrap) => setDiffOptions({ wrap })}
              />
            </>
          ) : null}
          {deleted === undefined ? null : (
            <SettingSwitch
              label="Show deleted files"
              checked={deleted.shown}
              onChange={deleted.onToggle}
            />
          )}
        </SettingsSheet>
      </span>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="View options"
        title="View options"
        className={cn(settingsTrigger, className)}
      >
        <SettingsIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {diff ? (
          <>
            <DropdownMenuCheckboxItem
              className="max-sm:min-h-11"
              checked={options.expandAll}
              onCheckedChange={(expandAll) => setDiffOptions({ expandAll })}
            >
              Expand all
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              className="max-sm:min-h-11"
              checked={options.wrap}
              onCheckedChange={(wrap) => setDiffOptions({ wrap })}
            >
              Wrap lines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              className="max-sm:hidden"
              checked={options.layout === 'split'}
              onCheckedChange={(split) =>
                setDiffOptions({ layout: split ? 'split' : 'unified' })
              }
            >
              Side by side
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
        {deleted === undefined ? null : (
          <>
            {diff ? <DropdownMenuSeparator /> : null}
            <DropdownMenuCheckboxItem
              className="max-sm:min-h-11"
              checked={deleted.shown}
              onCheckedChange={deleted.onToggle}
            >
              Show deleted files
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
