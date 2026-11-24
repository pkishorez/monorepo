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

import type { Branches } from '../../server/rpc/git/contract/index.js';
import { changesBlocked, type Unchanged } from '../logic/shared/index.js';
import {
  SettingsIcon,
  TreeSettingsRows,
  usePhone,
  type TreeSettingsProps,
} from './shared/index.js';
import { BranchMenu } from './branch-menu.js';
import { PhoneGitSettings } from './phone-settings.js';

/*
 * The three controls at the top right, and nothing else: Branch, the
 * branch whose files are shown; Compare to, the branch its changes are
 * measured against; and Changes, which colours what the branch changed,
 * and the sliders beside it: whether a Package's ignored files are drawn,
 * and while Changes is on, how what the branch left unchanged is drawn
 * and whether the files it deleted are. On a phone all of them sit in one
 * settings sheet, behind the sliders button.
 */

export interface GitControlsProps {
  /** The repository's branches; null while they are read. */
  readonly branches: Branches | null;
  /** Why there are none: the project is not in a git repository, say. */
  readonly problem: string | null;
  /** The branch shown. */
  readonly branch: string | null;
  /** The branch compared to. */
  readonly base: string | null;
  readonly changes: boolean;
  /** Changes is on, and what the branch changed is being read. */
  readonly reading: boolean;
  /** Why what the branch changed could not be read. */
  readonly changesProblem: string | null;
  /** Whether the files the branch deleted are drawn. */
  readonly deleted: boolean;
  /** How what the branch left unchanged is drawn. */
  readonly unchanged: Unchanged;
  /** Whether a Package's files outside its Source roots are drawn. */
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

/** A switch with its label, the whole of it one target; why it is off, when it cannot be on. */
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

/**
 * What the tree draws, behind the sliders, always there so nothing beside
 * it moves: the same settings a folder looked into offers. While the
 * changes are read it turns a spinner, and a warning when they cannot be.
 */
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
