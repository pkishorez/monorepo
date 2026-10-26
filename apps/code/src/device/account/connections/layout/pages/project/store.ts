import { Schema, Effect, Stream, Context, Layer } from 'effect';
import {
  HarnessInfo,
  SkillSchema,
  CodeClient,
  CodeClients,
} from '@kestack/connect/code';
import {
  Copy,
  copying,
  Cache,
  shelf,
} from '../../../connection/store/index.ts';
import {
  ModelsRead,
  Read,
  readOver,
  Connections,
} from '../../../connections.ts';
import { reasonOf } from '../../../connection/link/index.ts';
import { Command, type Self } from '@kestack/kabuki';
import { refreshSetup } from '../../../connection/index.ts';
import { Replicas } from '@kestack/std-toolkit/replica';
import { arrival } from '../../../connection/records/index.ts';

/*
 * What the project page keeps and gives the pages under it.
 *
 * The Catalog: what sessions in the project are started and run with:
 * every agent its Connection runs, one per Harness Account, each with its
 * settings, and the models each one that runs takes, as the Connection's
 * setup holds them; and the Skills each offers in the project's folder,
 * kept for the project. The project page keeps it and shares it with what
 * is under it (`SharedCatalog`), so moving between its sessions reads
 * nothing again.
 *
 * 1. Agents   and their models, followed from the Connection's setup, in the
 *             order the Connection first names the agents, each one's Default
 *             Account first; when they cannot be, the pickers say why.
 * 2. Skills   kept for the Account, Connection and project, shown at once,
 *             and asked behind for every agent that runs, once its keeper
 *             opens and again when another agent can run; an agent whose
 *             Skills are refused keeps what showed. Nothing waits for them.
 * 3. Retry    asks again what failed: the setup, or the Skills.
 *
 * And Session Arrival: whether a new session a Draft asked for came, once
 * the answer to the ask was lost (`SessionArrival`).
 */

export const SkillsRead = Read(SkillSchema);

/** The catalog as it is shared. */
export const Catalog = Schema.Struct({
  harnesses: Schema.NullOr(Schema.Array(HarnessInfo.schema)),
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

/** What its keeper holds: the setup's part, and the project's Skills, kept and asked behind. */
export const Keeper = Schema.Struct({
  setup: Schema.Struct({
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
  setup: { harnesses: null, problem: null, models: [] },
  accountId: null,
  skills: copying.empty,
};

/** The catalog its keeper shares. */
export const shared = ({ setup, skills }: Keeper): Catalog => ({
  ...setup,
  skills: skills.value ?? [],
});

/** What happened to the catalog, as its keeper's Message carries it. */
export const Change = Schema.TaggedUnion({
  SetupKnown: Keeper.fields.setup.fields,
  SkillsSaved: {
    accountId: Schema.String,
    skills: Schema.NullOr(Schema.Array(SkillsRead)),
  },
  SkillsAnswered: { since: Schema.Finite, skills: Schema.Array(SkillsRead) },
  Retry: {},
});

type Harness = typeof HarnessInfo.Type;

/** 1. Agents: each agent's accounts together, its Default Account, named as the agent, first. */
const grouped = (harnesses: ReadonlyArray<Harness>): ReadonlyArray<Harness> =>
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
 * answer; and whether the setup is to be asked again.
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
    case 'SetupKnown': {
      const before = running(keeper.setup.harnesses);
      const after = running(change.harnesses);
      // Another agent runs: its Skills are asked too.
      const more =
        keeper.setup.harnesses !== null &&
        after.some((account) => !before.includes(account));
      return {
        keeper: {
          ...keeper,
          setup: {
            ...change,
            harnesses:
              change.harnesses === null ? null : grouped(change.harnesses),
          },
          skills: more ? copying.ask(keeper.skills) : keeper.skills,
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
          skills: copying.read(keeper.skills, change.skills),
        },
        keep: null,
        refresh: false,
      };
    case 'SkillsAnswered': {
      if (!copying.latest(keeper.skills, change.since))
        return { keeper, keep: null, refresh: false };
      const skills = readOver(keeper.skills.value ?? [], change.skills);
      return {
        keeper: {
          ...keeper,
          skills: copying.answered(keeper.skills, change.since, skills),
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
            ? copying.ask(keeper.skills)
            : keeper.skills,
        },
        keep: null,
        refresh: keeper.setup.problem !== null || failed(keeper.setup.models),
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
 * the Connection has no Harness Account by it; null while they are, or will
 * be.
 */
export const unread = (catalog: Catalog, account: string | null) => {
  if (catalog.harnesses === null || account === null) return null;
  const harness = harnessOf(catalog, account);
  if (harness === null)
    return `This Connection has no Harness Account ${account}`;
  return harness.available
    ? null
    : (harness.unavailableReason ?? 'This agent cannot run on this Connection');
};

/** What the keeper still has to ask, for its Workers: the Skills, keyed by the ask, once the agents are known. */
export const wants = (keeper: Keeper) =>
  keeper.setup.harnesses === null ? [] : copying.asking(keeper.skills);

/*
 * What the catalog reads: the agents and their models from its Connection's
 * setup, followed; the Skills kept for the project; and the Skills each
 * agent that runs offers in the project's folder, asked of the Connection.
 * Each ends in the Change it makes.
 */

/** 1. The agents and their models as the Connection's setup holds them, now and on each change. */
export const followSetup = (connectionId: string) =>
  Stream.unwrap(
    Effect.map(Connections, ({ setup }) => setup(connectionId)),
  ).pipe(
    Stream.map((setup) => ({
      _tag: 'SetupKnown' as const,
      harnesses: setup?.harnesses ?? null,
      // Only while there are no agents to show is it said why.
      problem: setup?.harnesses === null ? setup.problem : null,
      models: setup?.models ?? [],
    })),
  );

/** 2. The Skills kept for the project, under the Account signed in. */
export const savedSkills = (connectionId: string, projectId: string) =>
  Effect.gen(function* () {
    const accountId = yield* (yield* Connections).account;
    const skills = yield* (yield* Cache).read(SkillsShelf, {
      accountId,
      connectionId,
      projectId,
    });
    return { _tag: 'SkillsSaved' as const, accountId, skills };
  });

/** 2. The Skills each agent that runs offers in the project's folder, answering the ask `since`. */
export const askSkills = (
  projectId: string,
  accounts: ReadonlyArray<string>,
  since: number,
) =>
  Effect.forEach(
    accounts,
    (account) =>
      CodeClient.use((api) => api.skills({ projectId, account })).pipe(
        Effect.map((list) => ({ account, list, problem: null })),
        Effect.catch((cause) =>
          Effect.succeed({ account, list: [], problem: reasonOf(cause) }),
        ),
      ),
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map((skills) => ({
      _tag: 'SkillsAnswered' as const,
      since,
      skills,
    })),
  );

/*
 * What the catalog's keeper asks after a Change: its project's Skills
 * kept, and its Connection's setup asked again.
 */

/** A project's Skills as kept, in its Connection's database's `skills` table. */
export const SkillsShelf = shelf('skills', 1, Schema.Array(SkillsRead));

/** Keeps the project's Skills; a write that fails is lost. */
export const keepSkills = Command.make('KeepSkills', {
  args: Schema.Struct({
    accountId: Schema.String,
    connectionId: Schema.String,
    projectId: Schema.String,
    skills: Schema.Array(SkillsRead),
  }),
  run: ({ accountId, connectionId, projectId, skills }) =>
    Effect.flatMap(Cache, (kept) =>
      kept.write(SkillsShelf, { accountId, connectionId, projectId }, skills),
    ),
});

/** The keeper after a Change, with what it asks: its Skills kept, its setup asked again. */
export const changed = (
  keeper: typeof Keeper.Type,
  change: typeof Change.Type,
  {
    connectionId,
    projectId,
  }: { readonly connectionId: string; readonly projectId: string },
) => {
  const { keeper: next, keep, refresh } = update(keeper, change);
  return {
    keeper: next,
    command: [
      ...(keep === null || next.accountId === null
        ? []
        : [
            keepSkills({
              accountId: next.accountId,
              connectionId,
              projectId,
              skills: keep,
            }),
          ]),
      ...(refresh ? [refreshSetup({ connectionId })] : []),
    ],
  };
};

/*
 * How an Actor keeps the catalog, the project page, for the Connection and
 * project its Props name: the Messages it is sent, the Workers
 * that read it, what each Message makes of it, and what it shares with
 * what is under it. The keeper holds it as `catalog` in its Model.
 */

/** The Connection and project a keeper keeps the catalog of. */
export type Where = {
  readonly connectionId: string;
  readonly projectId: string;
};

/** The Messages a keeper is sent. */
export const messages = {
  Catalog: { change: Change },
  CatalogRetryAsked: {},
};

type Holds = { readonly catalog: typeof Keeper.Type };
type Message =
  | { readonly _tag: 'Catalog'; readonly change: typeof Change.Type }
  | { readonly _tag: 'CatalogRetryAsked' };

/** The keeper's Model after a Change, with what it asks. */
const keep = <M extends Holds>(
  model: M,
  change: typeof Change.Type,
  where: Where,
) => {
  const { keeper, command } = changed(model.catalog, change, where);
  return { model: { ...model, catalog: keeper }, command };
};

/** The catalog kept for the Connection and project `where` reads from Props. */
export const keeping = <P>(where: (props: P) => Where) => {
  type Keeping = Self<Holds, unknown, Message, P>;
  return {
    /** The catalog as it shares it, and how it is read again. */
    shares: (self: Keeping) => ({
      changes: self.changes.pipe(
        Stream.map(({ model }) => shared(model.catalog)),
        Stream.changesWith(sameCatalog),
      ),
      retry: self.send({ _tag: 'CatalogRetryAsked' }),
    }),
    workers: {
      setup: {
        run: (self: Keeping) =>
          Effect.flatMap(self.get, ({ props }) =>
            Stream.runForEach(
              followSetup(where(props).connectionId),
              (change) => self.send({ _tag: 'Catalog', change }),
            ),
          ),
      },
      saved: {
        while: ({ model }: { readonly model: Holds }) =>
          !model.catalog.skills.keptRead,
        run: (self: Keeping) =>
          Effect.flatMap(self.get, ({ props }) => {
            const { connectionId, projectId } = where(props);
            return savedSkills(connectionId, projectId).pipe(
              Effect.flatMap((change) =>
                self.send({ _tag: 'Catalog', change }),
              ),
            );
          }),
      },
      skills: {
        each: ({ model }: { readonly model: Holds }) => wants(model.catalog),
        run: (self: Keeping, since: string) =>
          Effect.gen(function* () {
            const { model, props } = yield* self.get;
            const { connectionId, projectId } = where(props);
            const change = yield* CodeClients.on(
              connectionId,
              askSkills(
                projectId,
                running(model.catalog.setup.harnesses),
                Number(since),
              ),
            );
            yield* self.send({ _tag: 'Catalog', change });
          }),
      },
    },
    on: {
      Catalog: <M extends Holds>(
        { change }: { readonly change: typeof Change.Type },
        { model, props }: { readonly model: M; readonly props: P },
      ) => keep(model, change, where(props)),
      CatalogRetryAsked: <M extends Holds>(
        _: unknown,
        { model, props }: { readonly model: M; readonly props: P },
      ) => keep(model, { _tag: 'Retry' }, where(props)),
    },
  };
};

/*
 * The project's catalog, the agents, their models and Skills, as the
 * project page Provides it to the pages under it.
 */

/** The catalog as its keeper shares it with the pages under it. */
export class SharedCatalog extends Context.Service<
  SharedCatalog,
  {
    /** The catalog now, then each change. */
    readonly changes: Stream.Stream<typeof Catalog.Type>;
    /** Reads again what could not be read. */
    readonly retry: Effect.Effect<void>;
  }
>()('code/Catalog') {}

/*
 * Whether a new Session the Draft asked its Connection for is there, once
 * the answer to the ask was lost: as the project page Provides it to the
 * Draft under it, for its Connection.
 */

/** How long a Session asked for, its answer lost, is waited for, in ms. */
const WAIT = 15_000;

/** Whether a Session asked for has come, for one Connection. */
export class SessionArrival extends Context.Service<
  SessionArrival,
  {
    /** True once the Connection's Session with this id is held; false if it is not, in time. */
    readonly arrived: (sessionId: string) => Effect.Effect<boolean>;
  }
>()('code/SessionArrival') {
  /** For the Connection named, as the device holds its Sessions. */
  static readonly connection = (connectionId: string) =>
    Layer.effect(
      SessionArrival,
      Effect.map(Effect.context<Replicas>(), (replicas) =>
        SessionArrival.of({
          arrived: (sessionId) =>
            arrival(connectionId, sessionId).pipe(
              Effect.timeoutOption(WAIT),
              // The Connection's Instance held only while it waits.
              Effect.scoped,
              Effect.provideContext(replicas),
              Effect.map((came) => came._tag === 'Some'),
            ),
        }),
      ),
    );
}
