import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  GitBranchIcon,
  GitCompareArrowsIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import {
  Segments,
  SettingRow,
  SettingsSheet,
  SettingSwitch,
} from '../ui/index.js';
import { changesBlocked } from './blocked.js';
import { BranchMenu } from './branch-menu.js';
import { unchangedChoices } from './choices.js';
import type { GitControlsProps } from './git-controls.js';

/*
 * The git controls on a phone: one settings button beside the name, so
 * the header keeps one row, and a sheet with a row for each: Branch,
 * Compare to, Changes, and while Changes is on, its two options. The
 * button turns a spinner while the changes are read, and a warning when
 * they cannot be.
 */

export function PhoneGitSettings(props: GitControlsProps) {
  const { branches, problem, branch, base, changes } = props;
  const list = branches?.branches ?? [];
  const blocked = changesBlocked(props);
  const noGit = problem !== null || branches === null;
  const on = changes && blocked === null;
  const changesProblem = changes ? props.changesProblem : null;
  return (
    <SettingsSheet
      title="Settings"
      {...(changesProblem !== null
        ? { icon: <TriangleAlertIcon className="size-4 text-destructive" /> }
        : on && props.reading
          ? { icon: <Spinner className="size-4" /> }
          : {})}
    >
      <SettingRow label="Branch">
        <BranchMenu
          label="Branch"
          icon={<GitBranchIcon className="size-3.5" />}
          chosen={branch}
          current={branches?.current ?? null}
          branches={list}
          disabled={noGit}
          onChoose={props.onBranch}
          className="h-10 max-sm:max-w-52"
        />
      </SettingRow>
      <SettingRow label="Compare to">
        <BranchMenu
          label="Compare to"
          icon={<GitCompareArrowsIcon className="size-3.5" />}
          chosen={base}
          current={branches?.current ?? null}
          branches={list}
          disabled={noGit}
          onChoose={props.onBase}
          className="h-10 max-sm:max-w-52"
        />
      </SettingRow>
      <div aria-hidden className="mx-3 my-1 h-px bg-border/60" />
      <SettingSwitch
        label="Changes"
        hint={blocked ?? changesProblem ?? 'Colour what the branch changed'}
        checked={on}
        disabled={blocked !== null}
        onChange={props.onChanges}
      />
      {on ? (
        <>
          <SettingRow label="Unchanged files">
            <Segments
              label="Unchanged files"
              value={props.unchanged}
              choices={unchangedChoices}
              onChange={props.onUnchanged}
            />
          </SettingRow>
          <SettingSwitch
            label="Deleted files"
            checked={props.deleted}
            onChange={props.onDeleted}
          />
        </>
      ) : null}
    </SettingsSheet>
  );
}
