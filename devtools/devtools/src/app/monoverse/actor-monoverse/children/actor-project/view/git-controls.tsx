import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kestack/web-platform/ui/components/tooltip';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  GitBranchIcon,
  GitCompareArrowsIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useId } from 'react';

import type { Branches } from '../../../../server/rpc/git/contract/index.js';
import type { Unchanged } from '../../../logic/shared/index.js';
import { changesBlocked } from '../logic/shared/index.js';
import {
  SettingsIcon,
  TreeSettingsRows,
  usePhone,
  type TreeSettingsProps,
} from './shared/index.js';
import { BranchMenu } from './branch-menu.js';
import { PhoneGitSettings } from './phone-settings.js';

export interface GitControlsProps {
  readonly branches: Branches | null;
  readonly problem: string | null;
  readonly branch: string | null;
  readonly base: string | null;
  readonly changes: boolean;
  readonly reading: boolean;
  readonly changesProblem: string | null;
  readonly deleted: boolean;
  readonly unchanged: Unchanged;
  readonly ignored: boolean;
  readonly onBranch: (name: string) => void;
  readonly onBase: (name: string) => void;
  readonly onChanges: () => void;
  readonly onDeleted: () => void;
  readonly onUnchanged: (unchanged: Unchanged) => void;
  readonly onIgnored: () => void;
}

export function GitControls(props: GitControlsProps) {
  const phone = usePhone();
  if (phone) return <PhoneGitSettings {...props} />;
  return <WideGitControls {...props} />;
}

function WideGitControls(props: GitControlsProps) {
  const { branches, problem, branch, base, changes } = props;
  const list = branches?.branches ?? [];
  const blocked = changesBlocked(props);
  const noGit = problem !== null || branches === null;
  return (
    <div
      role="group"
      aria-label="Git"
      className="flex shrink-0 items-center gap-0.5"
    >
      <BranchMenu
        label="Branch"
        icon={<GitBranchIcon className="size-3.5" />}
        chosen={branch}
        current={branches?.current ?? null}
        branches={list}
        disabled={noGit}
        onChoose={props.onBranch}
      />
      <BranchMenu
        label="Compare to"
        icon={<GitCompareArrowsIcon className="size-3.5" />}
        prefix="vs"
        chosen={base}
        current={branches?.current ?? null}
        branches={list}
        disabled={noGit}
        onChoose={props.onBase}
      />
      <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />
      <ChangesToggle
        on={changes && blocked === null}
        blocked={blocked}
        problem={changes ? props.changesProblem : null}
        onToggle={props.onChanges}
      />
      <ViewSettings
        changesOn={changes && blocked === null}
        reading={changes && props.reading && blocked === null}
        problem={changes ? props.changesProblem : null}
        deleted={props.deleted}
        onDeleted={props.onDeleted}
        unchanged={props.unchanged}
        onUnchanged={props.onUnchanged}
        ignored={props.ignored}
        onIgnored={props.onIgnored}
      />
    </div>
  );
}

export function ChangesToggle({
  on,
  blocked,
  problem,
  onToggle,
}: {
  on: boolean;
  blocked: string | null;
  problem: string | null;
  onToggle: () => void;
}) {
  const id = useId();
  const toggle = (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 select-none',
        blocked === null
          ? 'cursor-pointer text-foreground/90 hover:bg-muted/70'
          : 'cursor-not-allowed text-muted-foreground/70',
      )}
    >
      <Switch
        id={id}
        size="sm"
        checked={on}
        disabled={blocked !== null}
        onCheckedChange={onToggle}
      />
      Changes
    </label>
  );
  const reason = blocked ?? problem;
  if (reason === null) return toggle;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        {toggle}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

function ViewSettings({
  reading,
  problem,
  ...settings
}: TreeSettingsProps & { reading: boolean; problem: string | null }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={problem ?? 'View settings'}
        title={problem ?? 'View settings'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 outline-none',
          'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-muted/70',
        )}
      >
        {problem !== null ? (
          <TriangleAlertIcon className="size-3.5 text-destructive" />
        ) : reading ? (
          <Spinner className="size-3" />
        ) : (
          <SettingsIcon />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-1">
        <TreeSettingsRows sheet={false} {...settings} />
      </PopoverContent>
    </Popover>
  );
}
