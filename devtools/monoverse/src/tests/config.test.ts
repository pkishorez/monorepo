import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChecked, parseConfig, presets } from '../index.ts';

const parse = (json: unknown) => parseConfig(JSON.stringify(json));

const config = (json: unknown) => {
  const result = parse(json);
  if (!result.ok) throw new Error(result.error);
  return result.config;
};

describe('parseConfig', () => {
  it('expands a preset into its rules', () => {
    expect(config({ sourceRoots: ['src/'], preset: 'kabuki' })).toEqual({
      sourceRoots: ['src'],
      ignore: [],
      rules: presets.kabuki,
    });
  });

  it("reads a package's own rules, leaving out the ones it does not name", () => {
    expect(
      config({
        $schema: './schema.json',
        sourceRoots: ['.'],
        ignore: ['**/fixtures/**'],
        rules: { imports: { doors: ['ports/*'] } },
      }),
    ).toEqual({
      sourceRoots: [''],
      ignore: ['**/fixtures/**'],
      rules: { imports: { doors: ['ports/*'] } },
    });
  });

  it.each([
    [
      'both a preset and rules',
      { sourceRoots: ['src'], preset: 'default', rules: {} },
      'monoverse.json needs exactly one of "preset" and "rules".',
    ],
    [
      'neither a preset nor rules',
      { sourceRoots: ['src'] },
      'monoverse.json needs exactly one of "preset" and "rules".',
    ],
    [
      'a key it does not know',
      { sourceRoots: ['src'], preset: 'default', exceptions: [] },
      'monoverse.json has "exceptions", which it does not know. It knows "$schema", "sourceRoots", "ignore", "preset", "rules".',
    ],
    [
      'a rule it does not know',
      { sourceRoots: ['src'], rules: { cycles: {} } },
      'monoverse.json has "rules.cycles", which it does not know. It knows "rules.imports", "rules.contracts".',
    ],
    [
      'a preset it does not know',
      { sourceRoots: ['src'], preset: 'toString' },
      'monoverse.json "preset" is "toString"; use one of "default", "kabuki".',
    ],
    [
      'no source roots',
      { preset: 'default' },
      'monoverse.json needs "sourceRoots".',
    ],
    [
      'an empty list of source roots',
      { sourceRoots: [], preset: 'default' },
      'monoverse.json "sourceRoots" must name at least one folder.',
    ],
    [
      'a source root outside the package',
      { sourceRoots: ['../other'], preset: 'default' },
      'monoverse.json "sourceRoots" has "../other", which is not inside the package.',
    ],
    [
      'imports without doors',
      { sourceRoots: ['src'], rules: { imports: {} } },
      'monoverse.json "rules.imports.doors" must be a list of strings.',
    ],
  ])('refuses %s', (_, json, error) => {
    expect(parse(json)).toEqual({ ok: false, error });
  });

  it('refuses text that is not JSON', () => {
    const result = parseConfig('{ "preset": ');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^monoverse.json is not JSON/);
  });
});

describe('isChecked', () => {
  const settings = config({
    sourceRoots: ['src'],
    ignore: ['**/tests/**', '**/*.test.ts'],
    preset: 'default',
  });

  it('checks a file inside a source root', () => {
    expect(isChecked(settings, 'src/app/start.ts')).toBe(true);
  });

  it('skips a file outside every source root', () => {
    expect(isChecked(settings, 'scripts/seed.ts')).toBe(false);
    expect(isChecked(settings, 'srcs/start.ts')).toBe(false);
  });

  it('skips a file an ignore glob matches', () => {
    expect(isChecked(settings, 'src/app/tests/logic.ts')).toBe(false);
    expect(isChecked(settings, 'src/app/start.test.ts')).toBe(false);
  });

  it('checks the whole package for a source root of "."', () => {
    const whole = config({ sourceRoots: ['.'], preset: 'default' });
    expect(isChecked(whole, 'scripts/seed.ts')).toBe(true);
  });
});

describe('what parseConfig cleans and refuses', () => {
  it('reads a file saved with a byte order mark', () => {
    expect(parseConfig('﻿{"sourceRoots":["src"],"preset":"default"}').ok).toBe(
      true,
    );
  });

  it('writes doors, contract folders and ignore globs the way the rules match them', () => {
    expect(
      config({
        sourceRoots: ['./src/'],
        ignore: ['./**/tests/**'],
        rules: {
          imports: { doors: ['./shared/', 'ports/*/'] },
          contracts: { folders: ['./ports/*'], required: ['ports/*/'] },
        },
      }),
    ).toEqual({
      sourceRoots: ['src'],
      ignore: ['**/tests/**'],
      rules: {
        imports: { doors: ['shared', 'ports/*'] },
        contracts: { folders: ['ports/*'], required: ['ports/*'] },
      },
    });
  });

  it('refuses a source root that is absolute or has a ".." anywhere, as the schema does', () => {
    for (const root of ['/abs', '../x', 'src/../..', 'a/../b'])
      expect(parse({ sourceRoots: [root], preset: 'default' }).ok).toBe(false);
    const pattern = new RegExp(
      (
        JSON.parse(
          readFileSync(new URL('../../schema.json', import.meta.url), 'utf8'),
        ) as {
          properties: { sourceRoots: { items: { pattern: string } } };
        }
      ).properties.sourceRoots.items.pattern,
    );
    for (const root of ['/abs', '../x', 'src/../..', 'a/../b'])
      expect(pattern.test(root)).toBe(false);
    for (const root of ['src', '.', './src/', 'a/..b'])
      expect(pattern.test(root)).toBe(true);
  });

  it('never checks a declaration file', () => {
    const whole = config({ sourceRoots: ['.'], preset: 'default' });
    expect(isChecked(whole, 'src/types.d.ts')).toBe(false);
    expect(isChecked(whole, 'src/types.d.mts')).toBe(false);
    expect(isChecked(whole, 'src/types.ts')).toBe(true);
  });
});
