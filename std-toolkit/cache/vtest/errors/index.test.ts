import { expect } from 'vitest';
import { Effect, Option } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { CacheError } from '@std-toolkit/cache';
import { MemoryCacheEntity } from '@std-toolkit/cache/memory';

vdescribe(
  'CacheError shape',
  '`CacheError` is a tagged error whose inner `error._tag` identifies the failure kind; `cause` carries the underlying error.',
  () => {
    vtest(
      'CacheError._tag is CacheError',
      '`Data.TaggedError` sets the outer `_tag` so `Effect.catchTag` can match it across realms.',
      () => {
        const err = CacheError.getFailed('boom');
        expect(err._tag).toBe('CacheError');
      },
    );

    vtest(
      'openFailed sets error._tag to OpenFailed',
      'The static factory maps to the matching variant in the inner discriminated union.',
      () => {
        const err = CacheError.openFailed('db unreachable');
        expect(err.error._tag).toBe('OpenFailed');
        expect(err.error.message).toBe('db unreachable');
      },
    );

    vtest(
      'getFailed sets error._tag to GetFailed',
      'Every read-path failure routes through this variant.',
      () => {
        const err = CacheError.getFailed('read threw');
        expect(err.error._tag).toBe('GetFailed');
      },
    );

    vtest(
      'putFailed sets error._tag to PutFailed',
      'Every write-path failure routes through this variant.',
      () => {
        const err = CacheError.putFailed('quota');
        expect(err.error._tag).toBe('PutFailed');
      },
    );

    vtest(
      'deleteFailed sets error._tag to DeleteFailed',
      'Single- and bulk-delete share this variant.',
      () => {
        const err = CacheError.deleteFailed('locked');
        expect(err.error._tag).toBe('DeleteFailed');
      },
    );

    vtest(
      'clearFailed sets error._tag to ClearFailed',
      'Teardown failures (`destroy`, `destroyAllDatabases`) use this variant.',
      () => {
        const err = CacheError.clearFailed('not allowed');
        expect(err.error._tag).toBe('ClearFailed');
      },
    );
  },
);

vdescribe(
  'cause preservation',
  'When a static factory is given a `cause`, it is preserved on `error.cause`; otherwise the field is left undefined.',
  () => {
    vtest(
      'cause is preserved when supplied',
      'The underlying error reaches the catch handler unchanged.',
      () => {
        const underlying = new Error('disk full');
        const err = CacheError.putFailed('write failed', underlying);
        expect(err.error.cause).toBe(underlying);
      },
    );

    vtest(
      'cause is undefined when omitted',
      'Variants raised without an underlying error report `cause: undefined`.',
      () => {
        const err = CacheError.getFailed('missing');
        expect(err.error.cause).toBeUndefined();
      },
    );
  },
);

vdescribe(
  'catchTag recovers from a real backend failure',
  '`Effect.catchTag("CacheError", …)` is the canonical recovery point regardless of which backend produced the failure.',
  () => {
    vtest(
      'catchTag recovers from a put that throws via a bad idField',
      'The `MemoryCacheEntity` wraps the synchronous throw in `PutFailed`, which the tag handler catches.',
      async () => {
        const cache = await Effect.runPromise(
          MemoryCacheEntity.make<{ id: string }>({
            name: 'Thing',
            idField: 'id',
          }),
        );

        // Force a throw inside `put` by handing it a value whose lookup
        // of `idField` blows up (Proxy that throws on property read).
        const exploding = new Proxy(
          {},
          {
            get() {
              throw new Error('boom');
            },
          },
        ) as { id: string };

        const recovered = await Effect.runPromise(
          cache
            .put({
              value: exploding,
              meta: { _e: 'Thing', _v: 'v1', _u: 'uid-1', _d: false },
            })
            .pipe(
              Effect.catchTag('CacheError', (err) =>
                Effect.succeed(`caught:${err.error._tag}`),
              ),
            ),
        );

        expect(recovered).toBe('caught:PutFailed');

        const empty = await Effect.runPromise(cache.get('anything'));
        expect(Option.isNone(empty)).toBe(true);
      },
    );
  },
);
