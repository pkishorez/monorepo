import { Context, Effect, Layer } from 'effect';

/*
 * The Vault seals each secret a user hands Console before it is stored, with
 * AES-256-GCM under `CONSOLE_VAULT_KEY`, one key per deployed stage kept as
 * a Worker secret. Storage only ever holds the sealed text: a fresh random
 * IV, then the ciphertext and its tag, as `v1.<iv>.<ciphertext>` in base64.
 *
 * A missing or malformed key, or sealed text that does not open, is a
 * defect: Console cannot keep or use a secret without its key, and nothing
 * the user did can fix it.
 */

const VERSION = 'v1';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const badKey = new Error('CONSOLE_VAULT_KEY must be 32 bytes, in base64.');

const importKey = (key: string | undefined) =>
  Effect.tryPromise({
    try: async () => {
      const raw = fromBase64(key ?? '');
      if (raw.byteLength !== 32) throw badKey;
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
    },
    catch: () => badKey,
  }).pipe(Effect.orDie);

export class Vault extends Context.Service<
  Vault,
  {
    /** `plaintext`, sealed so only this stage's key opens it. */
    readonly encrypt: (plaintext: string) => Effect.Effect<string>;
    /** What `encrypt` sealed. */
    readonly decrypt: (sealed: string) => Effect.Effect<string>;
  }
>()('alchemy-console/UserSpace/Vault') {
  /** The Vault under `key`, the Worker's `CONSOLE_VAULT_KEY`; a bad key fails each use, not the object. */
  static readonly layer = (key: string | undefined) =>
    Layer.effect(
      Vault,
      Effect.gen(function* () {
        const cryptoKey = yield* Effect.cached(importKey(key));
        return Vault.of({
          encrypt: (plaintext) =>
            Effect.gen(function* () {
              const key = yield* cryptoKey;
              const iv = crypto.getRandomValues(new Uint8Array(12));
              const sealed = yield* Effect.promise(() =>
                crypto.subtle.encrypt(
                  { name: 'AES-GCM', iv },
                  key,
                  new TextEncoder().encode(plaintext),
                ),
              );
              return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
            }),
          decrypt: (sealed) =>
            Effect.gen(function* () {
              const key = yield* cryptoKey;
              const [version, iv, data] = sealed.split('.');
              if (version !== VERSION || !iv || !data)
                return yield* Effect.die(new Error('Not sealed by the Vault.'));
              const opened = yield* Effect.tryPromise({
                try: () =>
                  crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: fromBase64(iv) },
                    key,
                    fromBase64(data),
                  ),
                catch: () => new Error('The Vault could not open a secret.'),
              }).pipe(Effect.orDie);
              return new TextDecoder().decode(opened);
            }),
        });
      }),
    );
}
