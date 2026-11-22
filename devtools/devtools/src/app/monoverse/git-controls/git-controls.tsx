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

import type { Branches } from '../contract/index.js';
import type { Unchanged } from '../tree/index.js';
import { Segments, SettingsIcon, usePhone } from '../ui/index.js';
import { changesBlocked } from './blocked.js';
import { BranchMenu } from './branch-menu.js';
import { PhoneGitSettings } from './phone-settings.js';
import { unchangedChoices } from './choices.js';

/*
 * The three controls at the top right, and nothing else: Branch, the
 * branch whose files are shown; Compare to, the branch its changes are
 * measured against; and Changes, which colours what the branch changed,
 * with its options beside it while it is on: how what the branch left
 * unchanged is drawn, and whether the files it deleted are. On a phone
 * all of them sit in one settings sheet, behind the sliders button.
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
  readonly onBranch: (name: string) => void;
  readonly onBase: (name: string) => void;
  readonly onChanges: () => void;
  readonly onDeleted: () => void;
  readonly onUnchanged: (unchanged: Unchanged) => void;
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
      <ChangesOptions
        shown={changes && blocked === null}
        reading={props.reading && blocked === null}
        problem={changes ? props.changesProblem : null}
        deleted={props.deleted}
        onDeleted={props.onDeleted}
        unchanged={props.unchanged}
        onUnchanged={props.onUnchanged}
      />
    </div>
  );
}

/** A switch with its label, the whole of it one target; why it is off, when it cannot be on. */
function ChangesToggle({
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
 * What Changes shows, a quiet arrow beside it: it keeps its place
 * whether Changes is on or off, so nothing beside it moves, and opens
 * only while it is on. While the changes are read it turns a spinner, and
 * a warning when they cannot be. Each option takes one line.
 */
function ChangesOptions({
  shown,
  reading,
  problem,
  deleted,
  onDeleted,
  unchanged,
  onUnchanged,
}: {
  /** Changes is on: the options are there to open. */
  shown: boolean;
  reading: boolean;
  problem: string | null;
  deleted: boolean;
  onDeleted: () => void;
  unchanged: Unchanged;
  onUnchanged: (unchanged: Unchanged) => void;
}) {
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger
        disabled={!shown}
        aria-hidden={!shown}
        tabIndex={shown ? undefined : -1}
        aria-label={problem ?? 'Changes options'}
        title={problem ?? 'Changes options'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,opacity] duration-150 outline-none',
          'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-muted/70',
          !shown && 'pointer-events-none opacity-0',
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
      <PopoverContent align="end" className="w-60 gap-0 p-1">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <span id={`${id}-unchanged`} className="text-sm">
            Unchanged
          </span>
          <Segments
            label="Unchanged files"
            value={unchanged}
            choices={unchangedChoices}
            onChange={onUnchanged}
          />
        </div>
        <label
          htmlFor={id}
          title="Draw the files the branch deleted"
          className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors duration-150 select-none hover:bg-muted/70"
        >
          Deleted
          <Switch
            id={id}
            size="sm"
            checked={deleted}
            onCheckedChange={onDeleted}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
