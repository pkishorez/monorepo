import { Effect, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { StudioRpc } from 'std-toolkit/studio-rpc';

import { agree, note, parity, settings, table } from '../../support.js';

const throughStudio = Effect.scoped(
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(StudioRpc);
    yield* Effect.forEach(
      ['alpha', 'alphabet', 'beta', 'gamma'],
      (title, index) =>
        note.insert({
          notebook: 'work',
          noteId: `studio-${index + 1}`,
          title,
          status: 'open',
        }),
    );
    yield* note.delete({ notebook: 'work', noteId: 'studio-3' });
    const snapshot = yield* client['Studio.GetTableSnapshot']();
    const singleton = yield* client['Studio.GetEntity']({
      entity: settings.name,
    });
    const query = (
      sk?: Parameters<(typeof client)['Studio.QueryEntities']>[0]['sk'],
    ) =>
      client['Studio.QueryEntities']({
        entity: note.name,
        accessPattern: 'byTitle',
        pk: { notebook: 'work' },
        ...(sk === undefined ? {} : { sk }),
      });
    const titles = (page: Effect.Success<ReturnType<typeof query>>) =>
      page.items.map(({ value }) => value.title);
    const all = yield* query();
    const first = yield* client['Studio.QueryEntities']({
      entity: note.name,
      accessPattern: 'byTitle',
      pk: { notebook: 'work' },
      limit: 2,
    });
    const second = yield* client['Studio.QueryEntities']({
      entity: note.name,
      accessPattern: 'byTitle',
      pk: { notebook: 'work' },
      limit: 2,
      after: first.items.at(-1)!,
    });
    const terminal = second.hasMore
      ? yield* client['Studio.QueryEntities']({
          entity: note.name,
          accessPattern: 'byTitle',
          pk: { notebook: 'work' },
          limit: 2,
          after: second.items.at(-1)!,
        })
      : second;
    return {
      logicalName: snapshot.logicalName,
      entities: snapshot.entities.map(({ name }) => name),
      singleton: singleton?.value,
      all: titles(all),
      equals: titles(yield* query({ operator: '=', value: { title: 'beta' } })),
      less: titles(yield* query({ operator: '<', value: { title: 'beta' } })),
      descendingAll: titles(yield* query({ operator: '<', value: null })),
      lessOrEqual: titles(
        yield* query({ operator: '<=', value: { title: 'beta' } }),
      ),
      greater: titles(
        yield* query({ operator: '>', value: { title: 'beta' } }),
      ),
      greaterOrEqual: titles(
        yield* query({ operator: '>=', value: { title: 'beta' } }),
      ),
      beginsWith: titles(
        yield* query({ operator: 'beginsWith', value: { title: 'alpha' } }),
      ),
      between: titles(
        yield* query({
          operator: 'between',
          value: [{ title: 'alpha' }, { title: 'beta' }],
        }),
      ),
      tombstone: all.items.find(({ value }) => value.title === 'beta')?.meta._d,
      pages: [...titles(first), ...titles(second)],
      hasMore: [first.hasMore, terminal.hasMore],
    };
  }),
).pipe(Effect.provide(StudioRpc.layer(table)));

const oldTable = StdTable.make(table.logicalName)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const currentTable = StdTable.make(table.logicalName)
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const OldArticle = EntityESchema.make('StudioArticle', 'articleId', {
  section: Schema.String,
  title: Schema.String,
}).build();

const CurrentArticle = EntityESchema.make('StudioArticle', 'articleId', {
  section: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { summary: Schema.String }, (previous) => ({
    ...previous,
    summary: `About ${previous.title}`,
  }))
  .build();

const oldArticle = oldTable
  .entity(OldArticle)
  .primary({ pk: ['section'] })
  .build();

currentTable
  .entity(CurrentArticle)
  .primary({ pk: ['section'] })
  .build();

const migratedThroughStudio = Effect.scoped(
  Effect.gen(function* () {
    yield* oldArticle.insert({
      articleId: 'a1',
      section: 'news',
      title: 'Tides',
    });
    const client = yield* RpcTest.makeClient(StudioRpc);
    return yield* client['Studio.GetEntity']({
      entity: CurrentArticle.name,
      key: { articleId: 'a1', section: 'news' },
    });
  }),
).pipe(Effect.provide(StudioRpc.layer(currentTable)));

export const readingThroughStudio = Story.make({
  title: 'Reading through Studio',
  description:
    'One runtime-discovered RPC group preserves the table Entity surface on every adapter.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What does Studio need to know before it reads an application table?',
      {
        answer:
          'Only the RPC URL. The snapshot discovers the table and schemas; named access patterns then perform the same queries as application code.',
        proof: Effect.gen(function* () {
          const results = yield* parity(throughStudio);
          yield* Story.assert('every adapter agrees', agree(results));
          yield* Story.assert(
            'snapshot discovery, singleton defaults, operators, tombstones, and pagination survive RPC',
            results.memory.logicalName === table.logicalName &&
              results.memory.entities.includes(note.name) &&
              results.memory.entities.includes(settings.name) &&
              results.memory.singleton?._v === 'v1' &&
              JSON.stringify(results.memory.all) ===
                JSON.stringify(['alpha', 'alphabet', 'beta', 'gamma']) &&
              JSON.stringify(results.memory.equals) ===
                JSON.stringify(['beta']) &&
              JSON.stringify(results.memory.less) ===
                JSON.stringify(['alphabet', 'alpha']) &&
              JSON.stringify(results.memory.descendingAll) ===
                JSON.stringify(['gamma', 'beta', 'alphabet', 'alpha']) &&
              JSON.stringify(results.memory.lessOrEqual) ===
                JSON.stringify(['beta', 'alphabet', 'alpha']) &&
              JSON.stringify(results.memory.greater) ===
                JSON.stringify(['gamma']) &&
              JSON.stringify(results.memory.greaterOrEqual) ===
                JSON.stringify(['beta', 'gamma']) &&
              JSON.stringify(results.memory.beginsWith) ===
                JSON.stringify(['alpha', 'alphabet']) &&
              JSON.stringify(results.memory.between) ===
                JSON.stringify(['alpha', 'alphabet', 'beta']) &&
              results.memory.tombstone === true &&
              JSON.stringify(results.memory.pages) ===
                JSON.stringify(['alpha', 'alphabet', 'beta', 'gamma']) &&
              JSON.stringify(results.memory.hasMore) ===
                JSON.stringify([true, false]),
          );
          return results;
        }),
      },
    ),
    Story.question(
      'What does Studio return for a row written at an old version?',
      {
        answer:
          'The normal Entity read migrates it in memory, then Studio encodes that result at the latest version for transport. Storage is not rewritten.',
        proof: Effect.gen(function* () {
          const results = yield* parity(migratedThroughStudio);
          yield* Story.assert('every adapter agrees', agree(results));
          yield* Story.assert(
            'the RPC result is the migrated latest encoded Entity',
            results.memory?.value._v === 'v2' &&
              results.memory.value.summary === 'About Tides',
          );
          return results;
        }),
      },
    ),
  ],
});
