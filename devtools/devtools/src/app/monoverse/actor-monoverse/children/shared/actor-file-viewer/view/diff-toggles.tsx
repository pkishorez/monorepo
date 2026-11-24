import type { ComponentType } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  Columns2Icon,
  TextWrapIcon,
} from 'lucide-react';

import { settingsTrigger } from '../../../../view/shared/index.js';
import { setDiffOptions, useDiffOptions } from './diff-options.js';

/*
 * How a diff reads, three buttons in its own header, each a press to turn
 * on and a press to turn off: every folded region open or folded again,
 * long lines wrapped, and one column or two (a phone always reads one).
 * The browser keeps them for every diff.
 */

export function DiffToggles() {
  const options = useDiffOptions();
  return (
    <span role="group" aria-label="How the diff reads" className="flex">
      <Toggle
        icon={options.expandAll ? ChevronsDownUpIcon : ChevronsUpDownIcon}
        label={options.expandAll ? 'Collapse all' : 'Expand all'}
        onPress={() => setDiffOptions({ expandAll: !options.expandAll })}
      />
      <Toggle
        icon={TextWrapIcon}
        label="Wrap lines"
        pressed={options.wrap}
        onPress={() => setDiffOptions({ wrap: !options.wrap })}
      />
      <Toggle
        icon={Columns2Icon}
        label="Side by side"
        pressed={options.layout === 'split'}
        className="max-sm:hidden"
        onPress={() =>
          setDiffOptions({
            layout: options.layout === 'split' ? 'unified' : 'split',
          })
        }
      />
    </span>
  );
}

/** One press turns it on, the next off; on, it reads as pressed. */
function Toggle({
  icon: Icon,
  label,
  pressed,
  className,
  onPress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** On or off; none for a button that names what it does next. */
  pressed?: boolean;
  className?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        settingsTrigger,
        pressed === true && 'bg-muted text-foreground',
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
