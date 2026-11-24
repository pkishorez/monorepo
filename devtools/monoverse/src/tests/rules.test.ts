import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Runs oxlint, as Vite+ ships it, with the plugin on and no options over
 * three fixture packages: `app`, whose monoverse.json sets the Kabuki
 * preset; `bare`, with none, so nothing is checked; and `invalid`, whose
 * monoverse.json is broken. Every line that should fail says so with
 * `// ✗ <rule>`: the test reads those marks, so the fixtures are their
 * own list of expectations.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const pkg = join(here, '../..');
const fixture = join(pkg, 'test/fixtures');
const vp = join(pkg, '../../node_modules/.bin/vp');

const lint = (): readonly string[] => {
  const config = {
    jsPlugins: [join(pkg, 'src/oxlint/index.ts')],
    rules: { 'monoverse/imports': 'error', 'monoverse/contracts': 'error' },
  };
  const configFile = join(
    mkdtempSync(join(tmpdir(), 'monoverse-')),
    '.oxlintrc.json',
  );
  writeFileSync(configFile, JSON.stringify(config));
  const output = run(vp, [
    'lint',
    '-c',
    configFile,
    '-A',
    'all',
    '--format',
    'json',
    fixture,
  ]);
  const { diagnostics } = JSON.parse(output) as {
    diagnostics: ReadonlyArray<{
      code: string;
      filename: string;
      labels: ReadonlyArray<{ span: { line: number } }>;
    }>;
  };
  return diagnostics
    .map((d) => {
      const rule = /^monoverse\((\w+)\)$/.exec(d.code)?.[1] ?? d.code;
      const file = relative(fixture, join(pkg, d.filename));
      return `${file}:${d.labels[0]?.span.line} ${rule}`;
    })
    .sort();
};

const marked = (): readonly string[] =>
  files(fixture)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...(/\/\/ ✗ (.*)$/.exec(line)?.[1] ?? '').matchAll(/\w+/g)].map(
            ([rule]) => `${relative(fixture, file)}:${i + 1} ${rule}`,
          ),
        ),
    )
    .sort();

const files = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

const run = (command: string, args: readonly string[]): string => {
  try {
    return execFileSync(command, args, { cwd: pkg, encoding: 'utf8' });
  } catch (error) {
    // oxlint exits 1 when it finds anything; its report is still on stdout.
    return (error as { stdout: string }).stdout;
  }
};

describe('the oxlint plugin', () => {
  it('fails exactly the lines marked ✗ in the fixture packages', () => {
    expect(lint()).toEqual(marked());
  });
});
