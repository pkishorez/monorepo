import { Context, Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor } from '@kestack/kabuki';
import { Plan } from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../contract/index.ts';
import { planOf } from '../real/blueprint.ts';
import { inPage } from '../real/index.ts';
import { Counter, started } from './diary.ts';

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

class Catalog extends Context.Service<
  Catalog,
  { readonly find: (id: string) => Effect.Effect<string> }
>()('Library/capability/Catalog') {}

const Book = Actor.define('Book', {
  description: 'One book on a shelf',
  requires: [Catalog],
  input: { id: Schema.String },
  props: { open: Schema.Boolean },
  model: { title: Schema.String },
  message: {
    Read: Schema.Struct({ page: Schema.Number }).annotate({
      description: 'Turn to a page',
    }),
  },
  emits: {
    Picked: Schema.Struct({ id: Schema.String }).annotate({
      description: 'Someone took it off the shelf',
    }),
    Dropped: {},
  },
}).build({
  init: ({ id }) => ({ model: { title: id } }),
  on: { Read: () => ({}) },
});

const Library = Actor.define('Library', {
  description: 'Books, behind a door that opens',
  state: { Locked: {}, Open: { since: Schema.Number } },
  model: { ids: Schema.Array(Schema.String) },
  message: {
    Unlocked: {},
    Shut: {},
    Removed: { id: Schema.String },
  },
  queries: {
    count: { result: Schema.Number },
    title: { args: { id: Schema.String }, result: Schema.String },
  },
}).build({
  init: () => ({ state: { _tag: 'Locked' }, model: { ids: [] } }),
  provides: {
    capabilities: [Catalog],
    layer: () => Layer.succeed(Catalog)({ find: Effect.succeed }),
  },
  workers: { dust: { run: () => Effect.never } },
  queries: { count: () => Effect.succeed(0) },
  children: { counter: Actor.child(Counter) },
  on: { Removed: () => ({}) },
  states: {
    Locked: {
      on: { Unlocked: () => ({ state: { _tag: 'Open', since: 1 } }) },
    },
    Open: {
      on: { Shut: () => ({ state: { _tag: 'Locked' } }) },
      workers: { tick: { while: () => true, run: () => Effect.never } },
      queries: { title: () => Effect.succeed('') },
      children: {
        books: Actor.child(Book, {
          each: ({ model }) => model.ids,
          input: (_, id) => ({ id }),
          props: () => ({ open: true }),
          emits: { Picked: (_, id) => ({ _tag: 'Removed', id }) },
        }),
      },
    },
  },
});

const text = { kind: 'text' } as const;
const number = { kind: 'number' } as const;
const field = (name: string, shape: unknown) => ({
  name,
  optional: false,
  nullable: false,
  shape,
});
const struct = (...fields: ReadonlyArray<ReturnType<typeof field>>) => ({
  kind: 'struct',
  fields,
});

describe('blueprint', () => {
  it("answers the root's Blueprint in the page, each Child under the path of its place", () =>
    run(
      Effect.gen(function* () {
        const { app } = yield* started;
        const session = yield* Effect.provide(
          Effect.service(KabukiSession),
          inPage(app),
        );
        const plan = yield* session.blueprint();
        expect(plan).toMatchObject({
          path: 'Diary',
          actor: 'Diary',
          description: 'Notes, each with when it was written',
          states: [{ tag: 'Single', data: struct() }],
          messages: [{ tag: 'Wrote', description: 'A note was written' }],
        });
        expect(plan.children).toEqual([
          {
            name: 'counter',
            runs: 'always',
            keyed: false,
            plan: expect.objectContaining({
              path: 'Diary/counter',
              actor: 'Counter',
              model: struct(field('count', number)),
              messages: [{ tag: 'Bumped', payload: struct() }],
              children: [],
            }),
          },
        ]);
        const encoded = Schema.encodeSync(Plan)(plan);
        expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
      }),
    ));

  it('says at which level each Message, Worker, Query and Capability is, and which State a Child is written in', () => {
    const plan = planOf(Library.blueprint);
    expect(plan.states).toEqual([
      { tag: 'Locked', data: struct() },
      { tag: 'Open', data: struct(field('since', number)) },
    ]);
    expect(plan.messages.map(({ tag, state }) => [tag, state])).toEqual([
      ['Removed', undefined],
      ['Unlocked', 'Locked'],
      ['Shut', 'Open'],
    ]);
    expect(plan.messages[0]).toEqual({
      tag: 'Removed',
      payload: struct(field('id', text)),
    });
    expect(plan.workers).toEqual([
      { name: 'dust', runs: 'always' },
      { name: 'tick', runs: 'while', state: 'Open' },
    ]);
    expect(plan.queries).toEqual([
      { name: 'count', result: number },
      {
        name: 'title',
        state: 'Open',
        args: struct(field('id', text)),
        result: text,
      },
    ]);
    expect(plan.provides).toEqual([{ name: 'Catalog' }]);
    expect(
      plan.children.map(({ name, state, runs, keyed, plan }) => [
        name,
        state,
        runs,
        keyed,
        plan.path,
      ]),
    ).toEqual([
      ['counter', undefined, 'always', false, 'Library/counter'],
      ['books', 'Open', 'each', false, 'Library/Open:books'],
    ]);
  });

  it("gives a Child's Input, Props, Emits and Requires", () => {
    const book = planOf(Library.blueprint).children[1]!.plan;
    expect(book).toMatchObject({
      actor: 'Book',
      description: 'One book on a shelf',
      input: struct(field('id', text)),
      props: struct(field('open', { kind: 'boolean' })),
      model: struct(field('title', text)),
      requires: ['Catalog'],
      messages: [{ tag: 'Read', description: 'Turn to a page' }],
    });
    expect(book.emits).toEqual([
      {
        tag: 'Picked',
        description: 'Someone took it off the shelf',
        payload: struct(field('id', text)),
      },
      { tag: 'Dropped', payload: struct() },
    ]);
  });

  it('stops where an Actor is its own Child below, naming the place it repeats', () => {
    const Folder = Actor.define('Folder', {
      description: 'Folders in folders',
    }).build({ children: { sub: Actor.child(Counter) } });
    const { definition } = Folder as unknown as {
      readonly definition: {
        readonly children: Record<string, Record<string, object>>;
      };
    };
    const slots = definition.children['Single']!;
    slots['sub'] = { ...slots['sub'], definition };
    const plan = planOf(Folder.blueprint);
    const [sub] = plan.children;
    expect(sub!.plan).toMatchObject({
      path: 'Folder/sub',
      actor: 'Folder',
      description: 'Folders in folders',
      repeats: 'Folder',
      children: [],
    });
    expect(planOf(Folder.blueprint)).toBe(plan);
  });
});
