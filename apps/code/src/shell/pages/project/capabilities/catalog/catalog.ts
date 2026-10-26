import { Schema } from 'effect';
import { HarnessInfo, SkillSchema } from '@kestack/connect/code';
import {
  Copy,
  copy,
  ModelsRead,
  Read,
  readOver,
} from '../../../../../layer/capabilities/index.ts';

/*
 * What sessions in a project are started and run with: every agent its
 * Machine runs, one per Harness Account, each with its settings, and the
 * models each one that runs takes, as the Machine's Kit holds them; and
 * the Skills each offers in the project's folder, kept for the project.
 * Its keeper, the project page or a Starter, shares it with what is under
 * it, so moving between its sessions reads nothing again.
 *
 * 1. Agents   and their models, followed from the Machine's Kit, in the
 *             order the Machine first names the agents, each one's Default
 *             Account first; when they cannot be, the pickers say why.
 * 2. Skills   kept for the Account, Machine and project, shown at once,
 *             and asked behind for every agent that runs, once its keeper
 *             opens and again when another agent can run; an agent whose
 *             Skills are refused keeps what showed. Nothing waits for them.
 * 3. Retry    asks again what failed: the Kit, or the Skills.
 */

export const SkillsRead = Read(SkillSchema);

/** The catalog as it is shared. */
export const Catalog = Schema.Struct({
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  /** Why the agents could not be read. */
  problem: Schema.NullOr(Schema.String),
  models: Schema.Array(ModelsRead),
  skills: Schema.Array(SkillsRead),
});
type Catalog = typeof Catalog.Type;

export const sameCatalog = Schema.toEquivalence(Catalog);

export const empty: Catalog = {
  harnesses: null,
  problem: null,
  models: [],
  skills: [],
};

/** What its keeper holds: the Kit's part, and the project's Skills, kept and asked behind. */
export const Keeper = Schema.Struct({
  kit: Schema.Struct({
    harnesses: Catalog.fields.harnesses,
    problem: Catalog.fields.problem,
    models: Catalog.fields.models,
  }),
  /** Whose the Skills are kept as; null until the kept ones are read. */
  accountId: Schema.NullOr(Schema.String),
  skills: Copy(Schema.Array(SkillsRead)),
});
type Keeper = typeof Keeper.Type;

export const fresh: Keeper = {
  kit: { harnesses: null, problem: null, models: [] },
  accountId: null,
  skills: copy.empty,
};

/** The catalog its keeper shares. */
export const shared = ({ kit, skills }: Keeper): Catalog => ({
  ...kit,
  skills: skills.value ?? [],
});

/** What happened to the catalog, as its keeper's Message carries it. */
export const Change = Schema.TaggedUnion({
  KitKnown: Keeper.fields.kit.fields,
  SkillsSaved: {
    accountId: Schema.String,
    skills: Schema.NullOr(Schema.Array(SkillsRead)),
  },
  SkillsAnswered: { since: Schema.Finite, skills: Schema.Array(SkillsRead) },
  Retry: {},
});

type Harness = typeof HarnessInfo.Type;

/** 1. Agents: each agent's accounts together, its Default Account, named as the agent, first. */
export const grouped = (
  harnesses: ReadonlyArray<Harness>,
): ReadonlyArray<Harness> =>
  [...new Set(harnesses.map(({ harness }) => harness))].flatMap((agent) => {
    const own = harnesses.filter(({ harness }) => harness === agent);
    return [
      ...own.filter(({ account }) => account === agent),
      ...own.filter(({ account }) => account !== agent),
    ];
  });

/** The Harness Accounts whose agents run. */
export const running = (harnesses: ReadonlyArray<Harness> | null) =>
  (harnesses ?? [])
    .filter(({ available }) => available)
    .map(({ account }) => account);

const failed = (reads: ReadonlyArray<{ readonly problem: string | null }>) =>
  reads.some(({ problem }) => problem !== null);

/**
 * The keeper after a Change; the Skills to keep, when they changed by an
 * answer; and whether the Kit is to be asked again.
 */
export const update = (
  keeper: Keeper,
  change: typeof Change.Type,
): {
  readonly keeper: Keeper;
  readonly keep: ReadonlyArray<typeof SkillsRead.Type> | null;
  readonly refresh: boolean;
} => {
  switch (change._tag) {
    // 1. Agents
    case 'KitKnown': {
      const before = running(keeper.kit.harnesses);
      const after = running(change.harnesses);
      // Another agent runs: its Skills are asked too.
      const more =
        keeper.kit.harnesses !== null &&
        after.some((account) => !before.includes(account));
      return {
        keeper: {
          ...keeper,
          kit: {
            ...change,
            harnesses:
              change.harnesses === null ? null : grouped(change.harnesses),
          },
          skills: more ? copy.ask(keeper.skills) : keeper.skills,
        },
        keep: null,
        refresh: false,
      };
    }
    // 2. Skills
    case 'SkillsSaved':
      return {
        keeper: {
          ...keeper,
          accountId: change.accountId,
          skills: copy.saved(keeper.skills, change.skills),
        },
        keep: null,
        refresh: false,
      };
    case 'SkillsAnswered': {
      if (!copy.latest(keeper.skills, change.since))
        return { keeper, keep: null, refresh: false };
      const skills = readOver(keeper.skills.value ?? [], change.skills);
      return {
        keeper: {
          ...keeper,
          skills: copy.answered(keeper.skills, change.since, skills),
        },
        keep: skills.filter(({ problem }) => problem === null),
        refresh: false,
      };
    }
    // 3. Retry
    case 'Retry':
      return {
        keeper: {
          ...keeper,
          skills: failed(keeper.skills.value ?? [])
            ? copy.ask(keeper.skills)
            : keeper.skills,
        },
        keep: null,
        refresh: keeper.kit.problem !== null || failed(keeper.kit.models),
      };
  }
};

/** The agent by its Harness Account; null when the catalog has none by it. */
export const harnessOf = (catalog: Catalog, account: string | null) =>
  catalog.harnesses?.find((each) => each.account === account) ?? null;

/** An agent's models as read, or undefined while they are being read. */
export const modelsOf = (catalog: Catalog, account: string | null) =>
  catalog.models.find((read) => read.account === account);

/** An agent's Skills as read, or undefined while they are being read. */
export const skillsOf = (catalog: Catalog, account: string | null) =>
  catalog.skills.find((read) => read.account === account);

/**
 * Why an agent's models and Skills are never read: it cannot run here, or
 * the Machine has no Harness Account by it; null while they are, or will
 * be.
 */
export const unread = (catalog: Catalog, account: string | null) => {
  if (catalog.harnesses === null || account === null) return null;
  const harness = harnessOf(catalog, account);
  if (harness === null) return `This Machine has no Harness Account ${account}`;
  return harness.available
    ? null
    : (harness.unavailableReason ?? 'This agent cannot run on this Machine');
};

/** What the keeper still has to ask, for its Workers: the Skills, keyed by the ask, once the agents are known. */
export const wants = (keeper: Keeper) =>
  keeper.kit.harnesses === null ? [] : copy.asking(keeper.skills);
