import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  GitBranchIcon,
  GitCompareArrowsIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { changesBlocked } from '../logic/shared/index.js';
import { PanelSection } from './panel-section.js';
import { TreeSettingsRows } from './shared/index.js';
import { BranchMenu } from './branch-menu.js';
import { ChangesToggle, type GitControlsProps } from './git-controls.js';

/*
 * The git controls held open in a wide screen's side panel, nothing behind
 * a button: Branch and Compare to, one under the other, then Changes; and
 * what the tree draws, the same rows the settings menu holds, those for
 * Changes greyed while it is off. While the changes are read a spinner
 * sits at the end of the Changes row, and a warning when they cannot be,
 * so nothing moves as they come and go.
 */

const wideMenu =
  'w-full max-w-none [&>span.truncate]:flex-1 [&>span.truncate]:text-left';

export function GitPanel(props: GitControlsProps) {
  const { branches, problem, branch, base, changes } = props;
  const list = branches?.branches ?? [];
  const blocked = changesBlocked(props);
  const noGit = problem !== null || branches === null;
  const on = changes && blocked === null;
  const changesProblem = changes ? props.changesProblem : null;
  return (
    <>
      <PanelSection title="Git">
        <BranchMenu
          label="Branch"
          icon={<GitBranchIcon className="size-3.5" />}
          chosen={branch}
          current={branches?.current ?? null}
          branches={list}
          disabled={noGit}
          onChoose={props.onBranch}
          className={wideMenu}
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
          className={wideMenu}
        />
        <div className="flex items-center gap-1 pr-2 [&>*:first-child]:flex-1">
          <ChangesToggle
            on={on}
            blocked={blocked}
            problem={changesProblem}
            onToggle={props.onChanges}
          />
          {changesProblem !== null ? (
            <TriangleAlertIcon
              role="img"
              aria-label={changesProblem}
              className="size-3.5 shrink-0 text-destructive"
            />
          ) : on && props.reading ? (
            <Spinner
              aria-label="Reading the changes"
              className="size-3 shrink-0"
            />
          ) : null}
        </div>
      </PanelSection>
      <PanelSection title="Show">
        <TreeSettingsRows
          sheet={false}
          keep
          changesOn={on}
          deleted={props.deleted}
          onDeleted={props.onDeleted}
          unchanged={props.unchanged}
          onUnchanged={props.onUnchanged}
          ignored={props.ignored}
          onIgnored={props.onIgnored}
        />
      </PanelSection>
    </>
  );
}
