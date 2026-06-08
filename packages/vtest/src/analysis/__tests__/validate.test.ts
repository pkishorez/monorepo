import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  discoverFeatures,
  loadToc,
  validate,
  type Diagnostic,
} from '@monorepo/vtest/analysis';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => path.join(here, 'fixtures', name);

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

const has = (
  diagnostics: ReadonlyArray<Diagnostic>,
  level: Diagnostic['level'],
  predicate: (d: Diagnostic) => boolean,
): boolean => diagnostics.some((d) => d.level === level && predicate(d));

describe('validate doc-test contract', () => {
  it('reports no diagnostics for a healthy package', async () => {
    const diagnostics = await run(validate(fixture('healthy')));
    expect(diagnostics).toEqual([]);
  });

  it('directive with no folder is an error', async () => {
    const diagnostics = await run(validate(fixture('missing-folder')));
    expect(has(diagnostics, 'error', (d) => d.groupId === 'ghost')).toBe(true);
  });

  it('orphan test folder is a warning', async () => {
    const diagnostics = await run(validate(fixture('orphan-folder')));
    expect(has(diagnostics, 'warning', (d) => d.groupId === 'lonely')).toBe(
      true,
    );
    expect(diagnostics.every((d) => d.level !== 'error')).toBe(true);
  });

  it('duplicate directive id is an error', async () => {
    const diagnostics = await run(validate(fixture('duplicate-id')));
    expect(
      has(
        diagnostics,
        'error',
        (d) => d.groupId === 'dup' && d.message.includes('duplicate'),
      ),
    ).toBe(true);
  });

  it('toc feature with no folder is an error; folder not in toc is a warning', async () => {
    const diagnostics = await run(validate(fixture('toc-mismatch')));
    expect(has(diagnostics, 'error', (d) => d.feature === 'ghostfeature')).toBe(
      true,
    );
    expect(has(diagnostics, 'warning', (d) => d.feature === 'draft')).toBe(
      true,
    );
  });
});

describe('discoverFeatures', () => {
  it('discovers features, directives, and test groups', async () => {
    const features = await run(discoverFeatures(fixture('healthy')));
    expect(features.map((f) => f.name)).toEqual(['alpha']);
    const alpha = features[0]!;
    expect(alpha.directives.map((d) => d.id)).toEqual(['case-a']);
    expect(alpha.groups.map((g) => g.id)).toEqual(['case-a']);
    expect(alpha.groups[0]!.testFiles).toEqual(['a.test.ts']);
  });

  it('returns empty for a package with no vtest folder', async () => {
    const features = await run(discoverFeatures(fixture('does-not-exist')));
    expect(features).toEqual([]);
  });
});

describe('loadToc', () => {
  it('loads a typed toc into ordered sections', async () => {
    const toc = await run(loadToc(fixture('healthy')));
    expect(toc.sections).toEqual([{ title: 'Start', features: ['alpha'] }]);
  });
});
