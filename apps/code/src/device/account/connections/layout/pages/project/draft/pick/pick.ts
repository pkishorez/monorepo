import type { StartStepName } from '@kestack/connect/code';
import * as Catalog from '../../store.ts';
import type { Model, Props } from '../actor.ts';
import { branchOf } from './branch/index.ts';

/*
 * What the Draft's picks come to: a new session's agent, model and
 * settings, each the one picked or its default, a Session's over its own,
 * and the branch it runs on; and the Skills the skills Picker lists for
 * the agent.
 */

/** What the model Picker is handed before anything is known, which it never opens for. */
export const NOBODY = { account: '', model: null, settings: {} };

/** A new session's agent, as the catalog describes it: the one picked, else the first that runs. */
export const pickedHarness = ({ catalog, chosen }: Model) =>
  Catalog.harnessOf(catalog, chosen.account) ??
  catalog.harnesses?.find(({ available }) => available) ??
  catalog.harnesses?.[0] ??
  null;

/** A new session's model: the one picked, or its agent's default. */
export const pickedModel = (model: Model) =>
  model.chosen.model ?? pickedHarness(model)?.defaultModel ?? null;

/** A new session's settings: each the one picked, or its default. */
export const pickedSettings = (model: Model): Record<string, string> =>
  Object.fromEntries(
    (pickedHarness(model)?.settings ?? []).map(({ key, default: value }) => [
      key,
      model.chosen.settings[key] ?? value,
    ]),
  );

/**
 * Where a new session runs: the branch picked, or the one the Project's
 * folder is on, and in a new Worktree or not; for a Project that is not a
 * git repository, wherever its folder is. Null while its branches are
 * read; once they could not be, the picks as they stand, as saved.
 */
export const pickedBranch = ({
  branches,
  unlisted,
  branch,
  newWorktree,
}: Model) =>
  branches === null
    ? unlisted
      ? { branch, newWorktree }
      : null
    : branches._tag === 'NotGit'
      ? { branch: null, newWorktree: false }
      : { branch: branchOf(branches, branch), newWorktree };

/**
 * The step a new session's start runs first, as Connect decides it for
 * where it runs: a new Worktree made, the folder switched to a branch no
 * Worktree has out, or else the agent started. Branches not known, a
 * branch picked is taken as one to switch to.
 */
export const firstStep = (
  { branches }: Model,
  where: { readonly branch: string | null; readonly newWorktree: boolean },
): StartStepName => {
  if (branches?._tag === 'NotGit') return 'startingAgent';
  if (where.newWorktree) return 'makingWorktree';
  if (where.branch === null) return 'startingAgent';
  if (branches === null) return 'switchingBranch';
  if (where.branch === branches.current) return 'startingAgent';
  const local =
    branches.local.find(({ name }) => name === where.branch) ??
    branches.local.find(({ upstream }) => upstream === where.branch);
  return local?.worktree ? 'startingAgent' : 'switchingBranch';
};

/** The agent, model and settings in effect, for the model Picker; null until they are known. */
export const current = (model: Model, { to }: Props) => {
  if (to._tag === 'Session')
    return to.agent === null
      ? null
      : {
          account: to.agent.account,
          model: model.chosen.model ?? to.agent.model,
          settings: { ...to.agent.settings, ...model.chosen.settings },
        };
  const harness = pickedHarness(model);
  return harness === null
    ? null
    : {
        account: harness.account,
        model: model.chosen.model,
        settings: model.chosen.settings,
      };
};

/** The agent's Skills, as the skills Picker lists them. */
export const skillsOf = (model: Model, props: Props) => {
  const account = current(model, props)?.account ?? null;
  const read = Catalog.skillsOf(model.catalog, account);
  // An agent that cannot run here has none to read: it says why.
  const unread = Catalog.unread(model.catalog, account);
  const loading =
    read === undefined &&
    unread === null &&
    (props.to._tag === 'Session' ||
      (model.catalog.harnesses === null
        ? model.catalog.problem === null
        : pickedHarness(model)?.available === true));
  return {
    skills: read?.list ?? [],
    loading,
    problem: read?.problem ?? (read === undefined ? unread : null),
  };
};
