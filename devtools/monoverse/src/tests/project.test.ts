import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkProject, openProject } from '../index.ts';

const root = fileURLToPath(new URL('../../test/fixtures', import.meta.url));

const walk = (dir = ''): readonly string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });

const files = walk();
const project = { root, files };
const reports = checkProject(project);
const reportOf = (path: string) => reports.find((r) => r.path === path);
const violations = reports.flatMap((r) =>
  r.result._tag === 'Checked' ? r.result.violations : [],
);

const marked = (): readonly string[] =>
  files
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      readFileSync(join(root, file), 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...(/\/\/ ✗ (.*)$/.exec(line)?.[1] ?? '').matchAll(/[\w-]+/g)].map(
            ([kind]) => `${file}:${i + 1} ${kind}`,
          ),
        ),
    )
    .sort();

describe('checkProject', () => {
  it('checks every package with a monoverse.json, and no other', () => {
    expect(reports.map((r) => r.path).sort()).toEqual([
      'alias',
      'app',
      'invalid',
    ]);
  });

  it('fails exactly the lines marked ✗ in the fixture packages', () => {
    expect(
      violations
        .filter((v) => !v.file.endsWith('monoverse.json'))
        .map((v) => `${v.file}:${v.line} ${v.kind}`)
        .sort(),
    ).toEqual(marked());
  });

  it('follows tsconfig paths, package.json imports and the package’s own name', () => {
    const start = violations.filter((v) => v.file === 'alias/src/start.ts');
    expect(start.map((v) => [v.specifier, v.to])).toEqual([
      ['@/feature/part.ts', 'alias/src/feature/part.ts'],
      ['#lib/deep/x.ts', 'alias/src/lib/deep/x.ts'],
      ['fixture-alias/feature/part.ts', 'alias/src/feature/part.ts'],
    ]);
  });

  it('tells an exception that lifts nothing and a stale restriction once, on the monoverse.json', () => {
    expect(
      violations
        .filter((v) => v.file === 'alias/monoverse.json')
        .map(({ kind, line, message }) => ({ kind, line, message })),
    ).toEqual([
      {
        kind: 'unused-exception',
        line: 11,
        message:
          "The exception from 'src/nowhere' to 'src/feature/part.ts' lets no import through. Remove it, or fix its globs.",
      },
      {
        kind: 'stale-restriction',
        line: 28,
        message:
          'The restriction from \'src/gone\' covers no file this package checks. Remove it, or fix its "from".',
      },
    ]);
  });

  it('tells each import a door or an exception lets through, and why', () => {
    const excepted = reports.flatMap((r) =>
      r.result._tag === 'Checked' ? r.result.excepted : [],
    );
    expect(excepted.find((e) => e.file === 'alias/src/host/main.ts')).toEqual({
      by: 'exception',
      file: 'alias/src/host/main.ts',
      line: 2,
      column: 22,
      specifier: '../feature/part.ts',
      to: 'alias/src/feature/part.ts',
      message:
        "'../feature/part.ts' breaks the rules, and the exception from 'src/host/**' to 'src/feature/part.ts' lets it through: The host wires the feature's parts itself.",
    });
    expect(
      excepted
        .filter((e) => e.file === 'app/src/feature/actor-feature/view/view.ts')
        .map(({ by, line, message }) => ({ by, line, message })),
    ).toEqual([
      {
        by: 'door',
        line: 1,
        message:
          "'../logic/shared/index.ts' is beside or above this file, and comes in through the door src/feature/actor-feature/logic/shared.",
      },
      {
        by: 'door',
        line: 6,
        message:
          "'../../server/rpc/contract/index.ts' is beside or above this file, and comes in through the door src/feature/server/rpc/contract.",
      },
      {
        by: 'door',
        line: 7,
        message:
          "'../../server/rpc/feature/contract/index.ts' is beside or above this file, and comes in through the door src/feature/server/rpc/feature/contract.",
      },
    ]);
  });

  it('lists every door folder that holds a checked file', () => {
    const app = reportOf('app')?.result;
    expect(app?._tag === 'Checked' ? app.doors : undefined).toEqual([
      'app/src/feature/actor-feature/children/shared',
      'app/src/feature/actor-feature/logic/shared',
      'app/src/feature/server/http/otlp/contract',
      'app/src/feature/server/rpc/contract',
      'app/src/feature/server/rpc/feature/contract',
      'app/src/feature/server/rpc/other/contract',
      'app/src/feature/server/services/db/contract',
      'app/src/feature/services/store/contract',
    ]);
  });

  it('gives a restriction’s reason with the import, by package name or by path', () => {
    expect(
      violations
        .filter((v) => v.kind === 'restriction')
        .map((v) => `${v.line}:${v.column} ${v.message}`),
    ).toEqual([
      "1:26 'react' may not be imported here: pure code has no React.",
      "2:26 'react/jsx-runtime' may not be imported here: pure code has no React.",
      "3:22 '../feature/index.ts' may not be imported here: pure code knows no feature.",
    ]);
  });

  it('tells a broken monoverse.json once, and checks nothing else in its package', () => {
    expect(reportOf('invalid')?.result).toEqual({
      _tag: 'Invalid',
      file: 'invalid/monoverse.json',
      message: 'monoverse.json needs exactly one of "preset" and "rules".',
    });
  });

  it('says a package given without a monoverse.json is unchecked', () => {
    expect(checkProject(project, { packages: ['bare'] })).toEqual([
      { path: 'bare', result: { _tag: 'Unchecked' } },
    ]);
  });
});

describe('openProject', () => {
  const opened = openProject(project);

  it('resolves every import of a file, judged or not', () => {
    expect(opened.importsOf('alias/src/start.ts')).toEqual([
      {
        specifier: '@/feature/index.ts',
        target: 'alias/src/feature/index.ts',
        line: 1,
        column: 22,
      },
      {
        specifier: '@/feature/part.ts',
        target: 'alias/src/feature/part.ts',
        line: 2,
        column: 29,
      },
      {
        specifier: '#lib/deep/index.ts',
        target: 'alias/src/lib/deep/index.ts',
        line: 3,
        column: 19,
      },
      {
        specifier: '#lib/deep/x.ts',
        target: 'alias/src/lib/deep/x.ts',
        line: 4,
        column: 27,
      },
      {
        specifier: 'fixture-alias/feature/part.ts',
        target: 'alias/src/feature/part.ts',
        line: 5,
        column: 30,
      },
      {
        specifier: './nested/src/n.ts',
        target: 'alias/src/nested/src/n.ts',
        line: 6,
        column: 19,
      },
    ]);
  });

  it('gives no target for a package outside the project, and nothing for a file it cannot read', () => {
    expect(opened.importsOf('alias/src/pure/calc.ts')[0]).toEqual({
      specifier: 'react',
      line: 1,
      column: 26,
    });
    expect(opened.importsOf('alias/missing.ts')).toEqual([]);
    expect(opened.importsOf('alias/package.json')).toEqual([]);
  });

  it('names the package that holds a path, nested ones included', () => {
    expect(opened.packageOf('alias/src/start.ts')).toBe('alias');
    expect(opened.packageOf('alias/src/nested/src/n.ts')).toBe(
      'alias/src/nested',
    );
    expect(opened.packageOf('alias')).toBe('alias');
    expect(opened.packageOf('README.md')).toBe('');
  });

  it('follows relative imports under a tsconfig whose `extends` is not installed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'monoverse-extends-'));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    write('tsconfig.json', '{ "extends": "@not/installed/tsconfig.json" }');
    write('src/start.ts', "import { inner } from './inner/index.ts';");
    write('src/inner/index.ts', 'export const inner = 1;');
    try {
      const opened = openProject({
        root: dir,
        files: ['tsconfig.json', 'src/start.ts', 'src/inner/index.ts'],
      });
      expect(opened.importsOf('src/start.ts')[0]?.target).toBe(
        'src/inner/index.ts',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds targets when the root is reached through a symbolic link, as the resolver answers with real paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'monoverse-link-'));
    mkdirSync(join(dir, 'real/src/inner'), { recursive: true });
    writeFileSync(
      join(dir, 'real/src/start.ts'),
      "import { inner } from './inner/index.ts';",
    );
    writeFileSync(
      join(dir, 'real/src/inner/index.ts'),
      'export const inner = 1;',
    );
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    try {
      const opened = openProject({
        root: join(dir, 'link'),
        files: ['src/start.ts', 'src/inner/index.ts'],
      });
      expect(opened.importsOf('src/start.ts')[0]?.target).toBe(
        'src/inner/index.ts',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a file from `read` when given, rather than the disk', () => {
    const read = openProject({
      ...project,
      read: (file) =>
        file === 'bare/src/start.ts'
          ? "import { inner } from './inner/index.ts';"
          : undefined,
    });
    expect(read.importsOf('bare/src/start.ts')).toEqual([
      {
        specifier: './inner/index.ts',
        target: 'bare/src/inner/index.ts',
        line: 1,
        column: 23,
      },
    ]);
  });
});

describe('what a file’s text is read as', () => {
  const virtual = (texts: Readonly<Record<string, string>>) => {
    const all = { 'p/package.json': '{}', ...texts };
    return {
      root,
      files: Object.keys(all),
      read: (file: string) => all[file as keyof typeof all],
    };
  };

  it('counts an `export {} from` and only a dynamic import of one literal', () => {
    const project = openProject(
      virtual({
        'p/src/f.ts': [
          "export {} from './x.ts';",
          "const a = import('./a/' + n + '.ts');",
          'const b = import(`./b.ts`);',
          'const c = import(`./c/${n}.ts`);',
          "const d = import('./d\\'s.ts');",
        ].join('\n'),
      }),
    );
    expect(
      project.importsOf('p/src/f.ts').map((i) => `${i.line} ${i.specifier}`),
    ).toEqual(['1 ./x.ts', '3 ./b.ts', "5 ./d's.ts"]);
  });

  it('counts imports and re-exports inside declare module and declare global', () => {
    const project = openProject(
      virtual({
        'p/src/types.d.ts': [
          "declare module './augmented.ts' {",
          "  import type { X } from './x.ts';",
          "  export { Y } from './y.ts';",
          '}',
          'declare global {',
          "  import type { G } from './g.ts';",
          '}',
          "export declare namespace N { export type { Z } from './z.ts'; }",
        ].join('\n'),
      }),
    );
    expect(
      project
        .importsOf('p/src/types.d.ts')
        .map((i) => `${i.line} ${i.specifier}`),
    ).toEqual(['2 ./x.ts', '3 ./y.ts', '6 ./g.ts', '8 ./z.ts']);
  });

  it('tells an unused entry at its own line, past braces in globs and the key as a value', () => {
    const config = [
      '{',
      '  "sourceRoots": ["src"],',
      '  "ignore": ["exceptions", "src/{x,y}/**"],',
      '  "preset": "default",',
      '  "exceptions": [',
      '    { "from": "src/{a,b}/**", "to": "src/{c,d}", "reason": "{ not one" },',
      '    {',
      '      "from": "src/e", "to": "src/f", "reason": "two"',
      '    }',
      '  ]',
      '}',
    ].join('\n');
    const [report] = checkProject(
      virtual({ 'p/monoverse.json': config, 'p/src/a.ts': '' }),
      { packages: ['p'] },
    );
    const told =
      report?.result._tag === 'Checked' ? report.result.violations : [];
    expect(told.map((v) => [v.kind, v.line, v.column])).toEqual([
      ['unused-exception', 6, 5],
      ['unused-exception', 7, 5],
    ]);
  });
});
