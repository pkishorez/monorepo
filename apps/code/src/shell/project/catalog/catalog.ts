import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { HarnessInfo, ModelInfo, SkillSchema } from '@kestack/ai-toolkit/api';
import { Command } from '@kestack/kabuki';
import { loadHarnesses, loadModels, loadSkills } from './api.ts';

/*
 * What sessions in a project are started and run with: every agent the
 * server runs, each with its settings; the models each agent takes; and
 * the Skills each offers in the project's folder. The project page keeps it
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
    harness: Schema.String,
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
  ModelsLoaded: { harness: Schema.String, list: Schema.Array(ModelInfo) },
  ModelsFailed: { harness: Schema.String, reason: Schema.String },
  SkillsLoaded: { harness: Schema.String, list: Schema.Array(SkillSchema) },
  SkillsFailed: { harness: Schema.String, reason: Schema.String },
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
          { harness: change.harness, list: change.list, problem: null },
        ],
      };
    case 'SkillsLoaded':
      return {
        ...catalog,
        skills: [
          ...catalog.skills,
          { harness: change.harness, list: change.list, problem: null },
        ],
      };
    case 'ModelsFailed':
      return {
        ...catalog,
        models: [
          ...catalog.models,
          { harness: change.harness, list: [], problem: change.reason },
        ],
      };
    case 'SkillsFailed':
      return {
        ...catalog,
        skills: [
          ...catalog.skills,
          { harness: change.harness, list: [], problem: change.reason },
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

/** The agent by its name; null when the catalog has none by it. */
export const harnessOf = (catalog: Catalog, name: string | null) =>
  catalog.harnesses?.find((each) => each.name === name) ?? null;

/** An agent's models as read, or undefined while they are being read. */
export const modelsOf = (catalog: Catalog, name: string | null) =>
  catalog.models.find(({ harness }) => harness === name);

/** An agent's Skills as read, or undefined while they are being read. */
export const skillsOf = (catalog: Catalog, name: string | null) =>
  catalog.skills.find(({ harness }) => harness === name);

const unread = (
  catalog: Catalog,
  read: ReadonlyArray<{ readonly harness: string }>,
) =>
  (catalog.harnesses ?? [])
    .filter(
      ({ name, available }) =>
        available && !read.some(({ harness }) => harness === name),
    )
    .map(({ name }) => name);

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

const unknown = (name: string) => `This server does not run ${name}`;

/** Reads what `wants` names, ending in the Change it makes. */
export const read = {
  harnesses: loadHarnesses,
  models: (catalog: Catalog, name: string) => {
    const harness = harnessOf(catalog, name);
    return harness === null
      ? Effect.succeed({
          _tag: 'ModelsFailed' as const,
          harness: name,
          reason: unknown(name),
        })
      : loadModels(harness.name);
  },
  skills: (catalog: Catalog, projectId: string, name: string) => {
    const harness = harnessOf(catalog, name);
    return harness === null
      ? Effect.succeed({
          _tag: 'SkillsFailed' as const,
          harness: name,
          reason: unknown(name),
        })
      : loadSkills(projectId, harness.name);
  },
};

/** The catalog as its keeper shares it with the pages under it. */
export class Shared extends Context.Service<
  Shared,
  {
    /** The catalog now, then each change. */
    readonly changes: Stream.Stream<Catalog>;
    /** Reads again what could not be read. */
    readonly retry: Effect.Effect<void>;
  }
>()('code/Catalog') {}

/** The Layer its keeper Provides, from its own Model's changes. */
export const share = (
  changes: Stream.Stream<Catalog>,
  retry: Effect.Effect<void>,
) => Layer.succeed(Shared, { changes: Stream.changes(changes), retry });

/** The catalog now and as it changes, for a page under its keeper to mirror. */
export const follow = Stream.unwrap(
  Effect.map(Shared, ({ changes }) => changes),
);

/** Reads again what could not be read. */
export const retry = Command.make('RetryCatalog', {
  run: () => Effect.flatMap(Shared, ({ retry }) => retry),
});
