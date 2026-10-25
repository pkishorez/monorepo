import { Effect, Schema } from 'effect';
import { HarnessInfo, ModelInfo, SkillSchema } from '@kestack/connect/code';
import { loadHarnesses, loadModels, loadSkills } from './api.ts';

/*
 * What sessions in a project are started and run with: every agent the
 * server runs, one per Harness Account, each with its settings; the models
 * each account's login takes; and the Skills each offers in the project's
 * folder. The project page keeps it
 * while it is open and shares it with the pages under it, so moving between
 * its sessions reads nothing again.
 *
 * 1. Agents   read once; when they cannot be, the pickers say why.
 * 2. Models   read for every agent that runs, once the agents are known.
 * 3. Skills   the same, in the project's folder. Nothing waits for them.
 * 4. Retry    drops what failed, so it is read again.
 */

const Read = <S extends Schema.Top>(item: S) =>
  Schema.Struct({
    /** The Harness Account it was read for. */
    account: Schema.String,
    list: Schema.Array(item),
    /** Why it could not be read; null when it was. */
    problem: Schema.NullOr(Schema.String),
  });

export const Catalog = Schema.Struct({
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo)),
  /** Why the agents could not be read. */
  problem: Schema.NullOr(Schema.String),
  models: Schema.Array(Read(ModelInfo)),
  skills: Schema.Array(Read(SkillSchema)),
});
type Catalog = typeof Catalog.Type;

export const empty: Catalog = {
  harnesses: null,
  problem: null,
  models: [],
  skills: [],
};

/** What happened to the catalog, as its keeper's Message carries it. */
export const Change = Schema.TaggedUnion({
  HarnessesLoaded: { harnesses: Schema.Array(HarnessInfo) },
  HarnessesFailed: { reason: Schema.String },
  ModelsLoaded: { account: Schema.String, list: Schema.Array(ModelInfo) },
  ModelsFailed: { account: Schema.String, reason: Schema.String },
  SkillsLoaded: { account: Schema.String, list: Schema.Array(SkillSchema) },
  SkillsFailed: { account: Schema.String, reason: Schema.String },
  Retry: {},
});

export const changed = (
  catalog: Catalog,
  change: typeof Change.Type,
): Catalog => {
  switch (change._tag) {
    case 'HarnessesLoaded':
      return { ...catalog, harnesses: change.harnesses, problem: null };
    case 'HarnessesFailed':
      return { ...catalog, problem: change.reason };
    case 'ModelsLoaded':
      return {
        ...catalog,
        models: [
          ...catalog.models,
          { account: change.account, list: change.list, problem: null },
        ],
      };
    case 'SkillsLoaded':
      return {
        ...catalog,
        skills: [
          ...catalog.skills,
          { account: change.account, list: change.list, problem: null },
        ],
      };
    case 'ModelsFailed':
      return {
        ...catalog,
        models: [
          ...catalog.models,
          { account: change.account, list: [], problem: change.reason },
        ],
      };
    case 'SkillsFailed':
      return {
        ...catalog,
        skills: [
          ...catalog.skills,
          { account: change.account, list: [], problem: change.reason },
        ],
      };
    // 4. Retry
    case 'Retry':
      return {
        ...catalog,
        problem: null,
        models: catalog.models.filter(({ problem }) => problem === null),
        skills: catalog.skills.filter(({ problem }) => problem === null),
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

const unread = (
  catalog: Catalog,
  read: ReadonlyArray<{ readonly account: string }>,
) =>
  (catalog.harnesses ?? [])
    .filter(
      ({ account, available }) =>
        available && !read.some((each) => each.account === account),
    )
    .map(({ account }) => account);

/** What the catalog still has to read, for its keeper's Workers. */
export const wants = {
  // 1. Agents
  harnesses: (catalog: Catalog) =>
    catalog.harnesses === null && catalog.problem === null,
  // 2. Models
  models: (catalog: Catalog) => unread(catalog, catalog.models),
  // 3. Skills
  skills: (catalog: Catalog) => unread(catalog, catalog.skills),
};

const unknown = (account: string) =>
  `This server has no Harness Account ${account}`;

/** Reads what `wants` names, ending in the Change it makes. */
export const read = {
  harnesses: loadHarnesses,
  models: (catalog: Catalog, account: string) =>
    harnessOf(catalog, account) === null
      ? Effect.succeed({
          _tag: 'ModelsFailed' as const,
          account,
          reason: unknown(account),
        })
      : loadModels(account),
  skills: (catalog: Catalog, projectId: string, account: string) =>
    harnessOf(catalog, account) === null
      ? Effect.succeed({
          _tag: 'SkillsFailed' as const,
          account,
          reason: unknown(account),
        })
      : loadSkills(projectId, account),
};
