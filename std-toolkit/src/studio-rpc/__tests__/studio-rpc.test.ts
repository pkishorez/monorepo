import { Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpEffect } from 'effect/unstable/http';
import {
  RpcClient,
  RpcGroup,
  RpcSerialization,
  RpcServer,
  RpcTest,
} from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';
import { Ulid } from '../../core/index.js';
import { StdTable } from '../../db/index.js';
import type {
  EncodedData,
  StdTableService,
} from '../../db/std-table/contract/index.js';
import { Memory } from '../../db/memory/index.js';
import { EntityESchema, ESchema } from '../../eschema/index.js';
import { StudioRpc } from '../index.js';

const table = StdTable.make('studio-rpc-test')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

const note = table
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .index('GSI1', 'byStatus', {
    pk: ['notebook'],
    sk: ['status', 'title'],
  })
  .build();

table
  .singleEntity(ESchema.make('Settings', { theme: Schema.String }).build())
  .default({ theme: 'light' });

let issued = 0;
const nextTestUlid = () => String(++issued).padStart(26, '0');

type StudioClient = Effect.Success<
  ReturnType<typeof RpcTest.makeClient<RpcGroup.Rpcs<typeof StudioRpc>>>
>;

const withStudio = <A, E>(
  use: (
    client: StudioClient,
  ) => Effect.Effect<A, E, StdTableService<'studio-rpc-test'>>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(StudioRpc);
      return yield* use(client);
    }),
  ).pipe(
    Effect.provide(StudioRpc.layer(table)),
    Effect.provide(Memory.make(table).layer),
    Effect.provideService(Ulid, nextTestUlid),
  );

describe('StudioRpc', () => {
  it('round-trips through Effect RPC over HTTP', async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const httpEffect = yield* RpcServer.toHttpEffect(StudioRpc);
          const handler = HttpEffect.toWebHandler(httpEffect);
          const client = yield* RpcClient.make(StudioRpc).pipe(
            Effect.provide(
              RpcClient.layerProtocolHttp({
                url: 'http://studio.test/rpc',
              }).pipe(
                Layer.provide(
                  FetchHttpClient.layer.pipe(
                    Layer.provide(
                      Layer.succeed(FetchHttpClient.Fetch, ((input, init) =>
                        handler(
                          new Request(input, init),
                        )) as typeof globalThis.fetch),
                    ),
                  ),
                ),
              ),
            ),
          );
          yield* note.insert({
            notebook: 'http',
            noteId: 'n1',
            title: 'Over HTTP',
            status: 'open',
          });
          const snapshot = yield* client['Studio.GetTableSnapshot']();
          const keyed = yield* client['Studio.GetEntity']({
            entity: 'Note',
            key: { notebook: 'http', noteId: 'n1' },
          });
          const singleton = yield* client['Studio.GetEntity']({
            entity: 'Settings',
          });
          const page = yield* client['Studio.QueryEntities']({
            entity: 'Note',
            accessPattern: 'primary',
            pk: { notebook: 'http' },
          });
          return { snapshot, keyed, singleton, page };
        }),
      ).pipe(
        Effect.provide(StudioRpc.layer(table)),
        Effect.provide(Memory.make(table).layer),
        Effect.provide(RpcSerialization.layerNdjson),
      ),
    );

    expect(result.snapshot.logicalName).toBe('studio-rpc-test');
    expect(
      result.keyed !== null && '_d' in result.keyed.meta
        ? result.keyed.meta._d
        : undefined,
    ).toBe(false);
    expect(result.keyed?.value.title).toBe('Over HTTP');
    expect(result.singleton?.value.theme).toBe('light');
    expect(result.page.items).toHaveLength(1);
  });

  it('discovers the table and preserves keyed and singleton get behavior', async () => {
    const result = await Effect.runPromise(
      withStudio((client) =>
        Effect.gen(function* () {
          const snapshot = yield* client['Studio.GetTableSnapshot']();
          const missing = yield* client['Studio.GetEntity']({
            entity: 'Note',
            key: { notebook: 'work', noteId: 'missing' },
          });
          const singleton = yield* client['Studio.GetEntity']({
            entity: 'Settings',
          });
          yield* note.insert({
            notebook: 'work',
            noteId: 'n1',
            title: 'Alpha',
            status: 'open',
          });
          const stored = yield* client['Studio.GetEntity']({
            entity: 'Note',
            key: { notebook: 'work', noteId: 'n1' },
          });
          return { snapshot, missing, singleton, stored };
        }),
      ),
    );

    expect(result.snapshot.logicalName).toBe('studio-rpc-test');
    expect(result.snapshot.entities.map(({ name }) => name)).toEqual([
      'Note',
      'Settings',
    ]);
    expect(result.missing).toBeNull();
    expect(result.singleton).toEqual({
      value: { _v: 'v1', theme: 'light' },
      meta: { _e: 'Settings', _u: '' },
    });
    expect(result.stored?.value).toMatchObject({
      _v: 'v1',
      noteId: 'n1',
      title: 'Alpha',
    });
  });

  it('queries every operator, keeps tombstones, and resumes after an encoded entity', async () => {
    const result = await Effect.runPromise(
      withStudio((client) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            ['alpha', 'alphabet', 'beta', 'gamma'],
            (title, index) =>
              note.insert({
                notebook: 'work',
                noteId: `n${index + 1}`,
                title,
                status: 'open',
              }),
          );
          yield* note.delete({ notebook: 'work', noteId: 'n3' });
          const query = (
            sk?:
              | {
                  readonly operator: '=' | 'beginsWith';
                  readonly value: Readonly<Record<string, string>>;
                }
              | {
                  readonly operator: '<' | '<=' | '>' | '>=';
                  readonly value: Readonly<Record<string, string>> | null;
                },
          ) =>
            client['Studio.QueryEntities']({
              entity: 'Note',
              accessPattern: 'byStatus',
              pk: { notebook: 'work' },
              ...(sk === undefined ? {} : { sk }),
            });
          const titles = (page: {
            readonly items: readonly { readonly value: EncodedData }[];
          }) => page.items.map(({ value }) => value.title as string);
          const all = yield* query();
          const first = yield* client['Studio.QueryEntities']({
            entity: 'Note',
            accessPattern: 'byStatus',
            pk: { notebook: 'work' },
            limit: 2,
          });
          const second = yield* client['Studio.QueryEntities']({
            entity: 'Note',
            accessPattern: 'byStatus',
            pk: { notebook: 'work' },
            limit: 2,
            after: first.items.at(-1)!,
          });
          return {
            all: titles(all),
            equals: titles(
              yield* query({
                operator: '=',
                value: { status: 'open', title: 'beta' },
              }),
            ),
            less: titles(
              yield* query({
                operator: '<',
                value: { status: 'open', title: 'beta' },
              }),
            ),
            descendingAll: titles(yield* query({ operator: '<', value: null })),
            lessOrEqual: titles(
              yield* query({
                operator: '<=',
                value: { status: 'open', title: 'beta' },
              }),
            ),
            greater: titles(
              yield* query({
                operator: '>',
                value: { status: 'open', title: 'beta' },
              }),
            ),
            greaterOrEqual: titles(
              yield* query({
                operator: '>=',
                value: { status: 'open', title: 'beta' },
              }),
            ),
            beginsWith: titles(
              yield* query({
                operator: 'beginsWith',
                value: { status: 'open', title: 'alpha' },
              }),
            ),
            between: titles(
              yield* client['Studio.QueryEntities']({
                entity: 'Note',
                accessPattern: 'byStatus',
                pk: { notebook: 'work' },
                sk: {
                  operator: 'between',
                  value: [
                    { status: 'open', title: 'alpha' },
                    { status: 'open', title: 'beta' },
                  ],
                },
              }),
            ),
            deleted: all.items.find(({ value }) => value.title === 'beta')?.meta
              ._d,
            page: [...titles(first), ...titles(second)],
            firstHasMore: first.hasMore,
            secondHasMore: second.hasMore,
          };
        }),
      ),
    );

    expect(result).toMatchObject({
      all: ['alpha', 'alphabet', 'beta', 'gamma'],
      equals: ['beta'],
      less: ['alphabet', 'alpha'],
      descendingAll: ['gamma', 'beta', 'alphabet', 'alpha'],
      lessOrEqual: ['beta', 'alphabet', 'alpha'],
      greater: ['gamma'],
      greaterOrEqual: ['beta', 'gamma'],
      beginsWith: ['alpha', 'alphabet'],
      between: ['alpha', 'alphabet', 'beta'],
      deleted: true,
      page: ['alpha', 'alphabet', 'beta', 'gamma'],
      firstHasMore: true,
      secondHasMore: false,
    });
  });

  it('returns structured runtime discovery and validation failures', async () => {
    const [unknownEntity, unknownPattern, invalidPk] = await Effect.runPromise(
      withStudio((client) =>
        Effect.all([
          client['Studio.GetEntity']({ entity: 'Missing' }).pipe(Effect.flip),
          client['Studio.QueryEntities']({
            entity: 'Note',
            accessPattern: 'missing',
            pk: { notebook: 'work' },
          }).pipe(Effect.flip),
          client['Studio.QueryEntities']({
            entity: 'Note',
            accessPattern: 'primary',
            pk: { wrong: 'work' },
          }).pipe(Effect.flip),
        ]),
      ),
    );

    expect(unknownEntity._tag).toBe('StudioUnknownEntity');
    expect(unknownPattern._tag).toBe('StudioUnknownAccessPattern');
    expect(invalidPk).toMatchObject({
      _tag: 'StudioInvalidInput',
      issues: [{ path: ['pk', 'notebook'] }, { path: ['pk', 'wrong'] }],
    });
  });
});

describe('StudioRpc migrations', () => {
  it('returns an old stored value migrated and re-encoded at the latest version', async () => {
    const oldTable = StdTable.make('studio-rpc-migration')
      .primary('pk', 'sk')
      .build();
    const currentTable = StdTable.make('studio-rpc-migration')
      .primary('pk', 'sk')
      .build();
    const oldSchema = EntityESchema.make('Article', 'articleId', {
      section: Schema.String,
      title: Schema.String,
    }).build();
    const currentSchema = EntityESchema.make('Article', 'articleId', {
      section: Schema.String,
      title: Schema.String,
    })
      .evolve('v2', { summary: Schema.String }, (previous) => ({
        ...previous,
        summary: `About ${previous.title}`,
      }))
      .build();
    const oldArticle = oldTable
      .entity(oldSchema)
      .primary({ pk: ['section'] })
      .build();
    currentTable
      .entity(currentSchema)
      .primary({ pk: ['section'] })
      .build();
    const layer = Memory.make(currentTable).layer;

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* oldArticle.insert({
            articleId: 'a1',
            section: 'news',
            title: 'Tides',
          });
          const client = yield* RpcTest.makeClient(StudioRpc);
          return yield* client['Studio.GetEntity']({
            entity: 'Article',
            key: { articleId: 'a1', section: 'news' },
          });
        }),
      ).pipe(
        Effect.provide(StudioRpc.layer(currentTable)),
        Effect.provide(layer),
        Effect.provideService(Ulid, nextTestUlid),
      ),
    );

    expect(result?.value).toEqual({
      _v: 'v2',
      articleId: 'a1',
      section: 'news',
      title: 'Tides',
      summary: 'About Tides',
    });
  });
});
