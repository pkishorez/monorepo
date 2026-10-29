import { Schema } from 'effect';
import type { Effect } from 'effect';
import { Branches } from '@kestack/connect/code';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { keys, useBound } from '../../../../../commands.ts';
import * as Picker from '../../../../../../../../../ui/controls/picker/index.ts';
import * as Settings from '../../../../../../../../../ui/controls/settings/index.ts';
import { tilde } from '../../../../../../../../../ui/labels/path/index.ts';

/*
 * The Branch Picker, on a new session's Draft only: one Step of the
 * Project's branches, in two sections, Local and Origin, as Connect lists
 * them. A local branch that tracks one on Origin says so under its name,
 * and Connect lists that one no more under Origin; one checked out in a
 * linked Worktree says where. The one picked is checked; until one is,
 * the one the Project's folder is on. It opens from the Branch row of the
 * new session's page, over the New Worktree switch, off until switched
 * on, which says what will happen on send. Both are drawn only once the
 * branches are read, and only for a Project that is a git repository;
 * one that is not says so in a line. `shift+b` opens it from the page's
 * Normal Mode; on touch it is a Sheet.
 */

/** A Project's branches, as git has them: never NotGit. */
export type Git = Extract<Branches, { readonly _tag: 'Git' }>;

/** The branch in effect: the one picked, or the one the Project's folder is on. */
export const branchOf = (branches: Git, picked: string | null) =>
  picked ?? branches.current;

/**
 * Each branch as a row: the local ones, then the Origin ones, each by the
 * name it is started on.
 */
export const rowsOf = (branches: Git, picked: string | null) => {
  const on = branchOf(branches, picked);
  const main = branches.worktrees[0]?.path ?? null;
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
    ...branches.origin.map((name) => ({
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

/**
 * Where a new session works, as the page draws it over the Draft: for a
 * git repository, the Branch row, which opens the Branch Picker, and the
 * New Worktree switch; for one that is not, a quiet line. Nothing while
 * the branches are read.
 */
export function BranchSettings({
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
  if (branches === null) return null;
  if (git === null)
    return (
      <p className="animate-in text-sm text-muted-foreground duration-200 ease-out fade-in-0 motion-reduce:animate-none">
        Not a git repository: works in this folder as it is.
      </p>
    );
  const on = branchOf(git, picked);
  const local = git.local.find(({ name }) => name === on);
  const main = git.worktrees[0]?.path ?? null;
  const elsewhere =
    local?.worktree != null && local.worktree !== main ? local.worktree : null;
  const said =
    on === null
      ? 'Pick a branch to start on'
      : newWorktree
        ? `Makes a new worktree and branch from ${on}`
        : elsewhere === null
          ? `Works in this folder on ${on}`
          : `Works in ${tilde(elsewhere)} on ${on}`;
  return (
    <div className="-mx-3 flex animate-in flex-col gap-0.5 duration-200 ease-out fade-in-0 motion-reduce:animate-none">
      <Picker.Frame
        how={how}
        mode="sheet"
        label="Branch"
        onOpen={onOpen}
        side="top"
        className="w-80"
        trigger={
          <button
            type="button"
            aria-label={`Branch: ${on ?? 'No branch'}`}
            title={branchKeys === null ? 'Branch' : `Branch (${branchKeys})`}
            className="focus-ring flex w-full items-center gap-6 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50 aria-expanded:bg-muted/50 motion-reduce:transition-none"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">Branch</span>
              <span className="text-sm text-muted-foreground">
                <span className="font-mono text-xs [overflow-wrap:anywhere] text-foreground/90">
                  {on ?? 'No branch'}
                </span>
                {local?.upstream != null && (
                  <span> · tracks {local.upstream}</span>
                )}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        }
      >
        {how !== null && children}
      </Picker.Frame>
      <Settings.Row
        id="new-worktree"
        name="New worktree"
        control={
          <Settings.Toggle
            labelledBy="new-worktree-name"
            on={newWorktree}
            onChange={onToggle}
          />
        }
        onToggle={onToggle}
      >
        {said}
      </Settings.Row>
    </div>
  );
}
