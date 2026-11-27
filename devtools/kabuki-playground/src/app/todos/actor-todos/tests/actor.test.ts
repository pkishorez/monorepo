import { Effect, Option, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { FakeWorld } from '@kestack/kabuki/fake';
import { server } from '../../../../services/server/fake/index.ts';
import { Todos } from '../index.ts';

const started = async (failing = false) => {
  const world = FakeWorld.make([server], {
    start: {
      server: {
        todos: [
          { id: 'todo-1', title: 'Buy milk', done: false },
          { id: 'todo-2', title: 'Read', done: true },
        ],
        latency: 0,
        failing,
      },
    },
  });
  const runtime = Runtime.make(Todos, { layer: world.layer });
  return { runtime, world };
};

const ready = (runtime: Awaited<ReturnType<typeof started>>['runtime']) =>
  Effect.runPromise(runtime.root.until((self) => self._tag === 'Ready')).then(
    (self) => {
      if (self._tag !== 'Ready') throw new Error('The list is not ready');
      return self;
    },
  );

describe('Todos', () => {
  it('loads from the server, one Todo per to-do, with done as Props', async () => {
    const { runtime } = await started();
    const list = await ready(runtime);
    expect(list.children.todos.map((todo) => todo.props.done)).toEqual([
      false,
      true,
    ]);
    await runtime.dispose();
  });

  it('ticks a Todo through an Emit, and the list hands done back down', async () => {
    const { runtime } = await started();
    const todo = (await ready(runtime)).children.todos[0]!;
    todo.send({ _tag: 'Toggled' });
    await Effect.runPromise(todo.until((self) => self.props.done));
    expect(runtime.root.model.done).toEqual(['todo-2', 'todo-1']);
    await runtime.dispose();
  });

  it('renames a Todo through the Store, and fails while the server does', async () => {
    const { runtime, world } = await started();
    const todo = (await ready(runtime)).children.todos[0]!;
    todo.send({ _tag: 'EditingStarted' });
    todo.send({ _tag: 'Renamed', title: 'Buy oat milk' });
    await Effect.runPromise(
      todo.until(
        (self) => self._tag === 'Idle' && self.model.title === 'Buy oat milk',
      ),
    );
    await Effect.runPromise(world.control('server', 'StartFailing', {}));
    todo.send({ _tag: 'EditingStarted' });
    todo.send({ _tag: 'Renamed', title: 'Buy nothing' });
    await Effect.runPromise(todo.until((self) => self._tag === 'Failed'));
    expect(todo.send({ _tag: 'EditingStarted' })).toBe('ignored');
    await runtime.dispose();
  });

  it('marks every to-do done, and syncs each one to the server with its own Worker', async () => {
    const { runtime, world } = await started();
    await ready(runtime);
    runtime.root.send({ _tag: 'AllToggled' });
    expect(runtime.root.model.syncing).toEqual(['todo-1']);
    await Effect.runPromise(
      runtime.root.until((self) => self.model.syncing.length === 0),
    );
    const fakes = await Effect.runPromise(Stream.runHead(world.fakes));
    expect(Option.getOrThrow(fakes)[0]?.value).toMatchObject({
      todos: [
        { id: 'todo-1', done: true },
        { id: 'todo-2', done: true },
      ],
    });
    await runtime.dispose();
  });

  it('saves the last tick when a to-do is ticked again while it is saving', async () => {
    const { runtime, world } = await started();
    await ready(runtime);
    await Effect.runPromise(
      world.control('server', 'SetLatency', { latency: 50 }),
    );
    runtime.root.send({ _tag: 'Toggled', id: 'todo-1' });
    await Effect.runPromise(Effect.sleep('10 millis'));
    runtime.root.send({ _tag: 'Toggled', id: 'todo-1' });
    await Effect.runPromise(
      runtime.root.until((self) => self.model.syncing.length === 0),
    );
    const fakes = await Effect.runPromise(Stream.runHead(world.fakes));
    expect(Option.getOrThrow(fakes)[0]?.value).toMatchObject({
      todos: [
        { id: 'todo-1', done: false },
        { id: 'todo-2', done: true },
      ],
    });
    await runtime.dispose();
  });

  it('shows a failed load, and loads again on Retried', async () => {
    const { runtime, world } = await started(true);
    await Effect.runPromise(
      runtime.root.until((self) => self._tag === 'Failed'),
    );
    await Effect.runPromise(world.control('server', 'StopFailing', {}));
    runtime.root.send({ _tag: 'Retried' });
    await ready(runtime);
    await runtime.dispose();
  });
});
