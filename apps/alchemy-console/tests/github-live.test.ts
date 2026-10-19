import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { GitHub } from '../src/server/user-space/services/github/index.ts';

/*
 * The real GitHub, as the dev App `alchemy-console-dev` sees it: installed
 * on `pkishorez` as installation 173147687, with the sandbox repository
 * only. Runs only where the dev App's keys are on disk, in `.env.github-dev`
 * beside the app or at `CONSOLE_GITHUB_ENV`; a fresh checkout and CI skip it.
 */

const file =
  process.env.CONSOLE_GITHUB_ENV ??
  fileURLToPath(new URL('../.env.github-dev', import.meta.url));

const envOf = (text: string) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match) => match !== null)
      .map(([, key, value]) => [key!, value!.replace(/^"(.*)"$/, '$1')]),
  );

const SANDBOX_INSTALLATION = 173147687;

describe.skipIf(!existsSync(file))('GitHub, live, as the dev App', () => {
  it('lists the sandbox installation’s repositories', async () => {
    const env = envOf(readFileSync(file, 'utf8'));
    const repositories = await Effect.runPromise(
      Effect.flatMap(GitHub, (github) =>
        Effect.all([
          github.installation(SANDBOX_INSTALLATION),
          github.repositories(SANDBOX_INSTALLATION),
        ]),
      ).pipe(
        Effect.provide(
          GitHub.layer(
            {
              appId: env.GH_APP_ID!,
              slug: env.GH_APP_SLUG!,
              privateKey: env.GH_APP_PRIVATE_KEY!,
            },
            (input, init) => fetch(input, init),
          ),
        ),
      ),
    );
    const [installation, repos] = repositories;
    expect(installation.accountLogin).toBe('pkishorez');
    expect(repos.map((repo) => repo.fullName)).toContain(
      'pkishorez/alchemy-console-sandbox',
    );
  });
});
