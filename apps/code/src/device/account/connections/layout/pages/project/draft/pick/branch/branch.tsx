import { Schema } from 'effect';
import type { Effect } from 'effect';
import { Branches } from '@kestack/connect/code';
import { ChevronDownIcon, FolderGit2Icon, GitBranchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { keys, useBound } from '../../../../../commands.ts';
import * as Picker from '../../../../../../../../../ui/controls/picker/index.ts';

/*
 * The Branch Picker, on a new session's Draft only: one Step of the
 * Project's branches, in two sections, Local and Origin. A local branch
 * that tracks one on Origin says so under its name, and that one is not
 * listed again under Origin; one checked out in a linked Worktree says
 * where. The one picked is checked; until one is, the one the Project's
 * folder is on. Beside its trigger in the Status Line, the New Worktree
 * toggle, off until switched on. Both are drawn only once the branches
 * are read, and only for a Project that is a git repository. `shift+b`
 * opens it from the page's Normal Mode; on touch it is a Sheet.
 */

/** A Project's branches, as git has them: never NotGit. */
export type Git = Extract<Branches, { readonly _tag: 'Git' }>;

/** The branch in effect: the one picked, or the one the Project's folder is on. */
export const branchOf = (branches: Git, picked: string | null) =>
  picked ?? branches.current;

/**
 * Each branch as a row: the local ones, then the Origin ones no local
 * branch tracks, each by the name it is started on.
 */
export const rowsOf = (branches: Git, picked: string | null) => {
  const on = branchOf(branches, picked);
  const main = branches.worktrees[0]?.path ?? null;
  const tracked = new Set(
    branches.local.flatMap(({ upstream }) => upstream ?? []),
  );
  return [
    ...branches.local.map(({ name, upstream, worktree }) => {
      const detail = [
        upstream === null ? null : `tracks ${upstream}`,
        worktree === null || worktree === main
          ? null
          : `checked out in ${worktree}`,
      ]
        .filter((each) => each !== null)
        .join(' · ');
      return {
        value: name,
        label: name,
        group: 'Local',
        checked: name === on,
        ...(detail === '' ? {} : { detail }),
      };
    }),
    ...branches.origin
      .filter((name) => !tracked.has(name))
      .map((name) => ({
        value: name,
        label: name,
        group: 'Origin',
        checked: name === on,
      })),
  ];
};

const Listing = Schema.Struct({
  branches: Branches.schema,
  picked: Schema.NullOr(Schema.String),
});

const Branch = Picker.make('BranchPicker', {
  props: Listing,
  steps: {
    branch: {
      placeholder: () => 'Search branches',
      empty: () => 'No branch by that name',
      rows: ({ props }) => ({
        rows:
          props.branches._tag === 'Git'
            ? rowsOf(props.branches, props.picked)
            : [],
      }),
    },
  },
});

/**
 * The Branch Picker the Draft keeps while it is open: one Step of
 * branches. `done` hears the branch picked, or null.
 */
export const BranchPicker = {
  Live: Branch.Live,
  View: Branch.View,
  opening: (how: typeof Picker.How.Type) => ({
    how,
    step: { id: 'branch', key: '' },
    choices: [],
  }),
  owner: (done: (branch: string | null) => Effect.Effect<void>) =>
    Branch.owner({ done: (choices) => done(choices?.at(-1)?.value ?? null) }),
};

const trigger =
  'focus-ring inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-foreground pointer-coarse:h-11 pointer-coarse:px-3 motion-reduce:transition-none';

/**
 * The Branch Picker's trigger and the New Worktree toggle, in the Status
 * Line or the Touch Draft's head; nothing until the branches are read,
 * and nothing for a Project that is not a git repository.
 */
export function BranchTrigger({
  branches,
  picked,
  newWorktree,
  how,
  onOpen,
  onToggle,
  children,
}: {
  /** null while they are read. */
  readonly branches: Branches | null;
  readonly picked: string | null;
  readonly newWorktree: boolean;
  /** How the Picker is open; null while it is not. */
  readonly how: typeof Picker.How.Type | null;
  readonly onOpen: (how: typeof Picker.How.Type) => void;
  readonly onToggle: () => void;
  /** The Picker's View, while it is open. */
  readonly children: ReactNode;
}) {
  const open = Picker.useOpen();
  const branchKeys = useBound('content.branch');
  const git = branches?._tag === 'Git' ? branches : null;
  keys.useAction('content.branch', () => open(() => onOpen('keys')), {
    enabled: git !== null,
  });
  if (git === null) return null;
  const on = branchOf(git, picked) ?? 'No branch';
  return (
    <>
      <Picker.Frame
        how={how}
        mode="sheet"
        label="Branch"
        onOpen={onOpen}
        className="w-72"
        trigger={
          <button
            type="button"
            aria-label={`Branch: ${on}`}
            title={branchKeys === null ? 'Branch' : `Branch (${branchKeys})`}
            className={trigger}
          >
            <GitBranchIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate text-foreground/90">{on}</span>
            <ChevronDownIcon
              aria-hidden
              className="size-3 shrink-0 opacity-60"
            />
          </button>
        }
      >
        {how !== null && children}
      </Picker.Frame>
      <button
        type="button"
        aria-pressed={newWorktree}
        aria-label="New worktree"
        title={
          newWorktree
            ? 'In a new worktree, on a new branch from this one'
            : 'Where this branch is checked out'
        }
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
        className={`${trigger} shrink-0`}
      >
        <FolderGit2Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="hidden @md/status:inline pointer-coarse:inline">
          New worktree
        </span>
      </button>
    </>
  );
}
