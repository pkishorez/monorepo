import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { makeSqliteProjectRegistry } from '../index.js';

describe('ProjectRegistry', () => {
  test('adds, lists, updates, and removes entries per Tool', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* makeSqliteProjectRegistry({
            path: ':memory:',
          });
          const a = yield* registry.add({
            tool: 'laymos',
            path: '/tmp/a',
            label: null,
          });
          yield* registry.add({
            tool: 'monoverse',
            path: '/tmp/b',
            label: 'B',
          });

          expect((yield* registry.list('laymos')).map((e) => e.path)).toEqual([
            '/tmp/a',
          ]);
          expect(
            (yield* registry.list('monoverse')).map((e) => e.label),
          ).toEqual(['B']);

          const updated = yield* registry.update(a.id, {
            path: '/tmp/a2',
            label: 'A',
          });
          expect(updated).toMatchObject({ path: '/tmp/a2', label: 'A' });
          expect(
            yield* registry.update('missing', { path: '/x', label: null }),
          ).toBeNull();

          expect(yield* registry.remove(a.id)).toBe(true);
          expect(yield* registry.remove(a.id)).toBe(false);
          expect(yield* registry.list('laymos')).toEqual([]);
        }),
      ),
    );
  });
});
