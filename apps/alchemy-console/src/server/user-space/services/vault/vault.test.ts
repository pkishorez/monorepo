import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { Vault } from './index.ts';

const keyOf = (byte: number) =>
  Buffer.from(new Uint8Array(32).fill(byte)).toString('base64');

const withVault = <A, E>(
  key: string | undefined,
  use: Effect.Effect<A, E, Vault>,
) => Effect.runPromiseExit(use.pipe(Effect.provide(Vault.layer(key))));

describe('Vault', () => {
  it('gives back what it sealed, and the sealed text never holds it', async () => {
    const exit = await withVault(
      keyOf(1),
      Effect.gen(function* () {
        const vault = yield* Vault;
        const sealed = yield* vault.encrypt('cf-token-123');
        return { sealed, opened: yield* vault.decrypt(sealed) };
      }),
    );
    expect(Exit.isSuccess(exit) && exit.value.opened).toBe('cf-token-123');
    expect(Exit.isSuccess(exit) && exit.value.sealed).not.toContain('cf-token');
  });

  it('seals the same text differently each time', async () => {
    const exit = await withVault(
      keyOf(1),
      Effect.gen(function* () {
        const vault = yield* Vault;
        return [yield* vault.encrypt('same'), yield* vault.encrypt('same')];
      }),
    );
    expect(Exit.isSuccess(exit) && exit.value[0] !== exit.value[1]).toBe(true);
  });

  it('cannot open text sealed under another key, or changed', async () => {
    const sealed = await Effect.runPromise(
      Effect.flatMap(Vault, (vault) => vault.encrypt('secret')).pipe(
        Effect.provide(Vault.layer(keyOf(1))),
      ),
    );
    const otherKey = await withVault(
      keyOf(2),
      Effect.flatMap(Vault, (vault) => vault.decrypt(sealed)),
    );
    expect(Exit.isFailure(otherKey)).toBe(true);
    const tampered = await withVault(
      keyOf(1),
      Effect.flatMap(Vault, (vault) =>
        vault.decrypt(`${sealed.slice(0, -2)}AA`),
      ),
    );
    expect(Exit.isFailure(tampered)).toBe(true);
  });

  it('refuses to seal without a 32-byte key', async () => {
    for (const key of [undefined, '', keyOf(1).slice(4)]) {
      const exit = await withVault(
        key,
        Effect.flatMap(Vault, (vault) => vault.encrypt('secret')),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }
  });
});
