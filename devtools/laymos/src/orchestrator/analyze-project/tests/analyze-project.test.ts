import { fileURLToPath } from 'node:url';

import { Effect, Schema } from 'effect';
import { describe, expect, test } from 'vitest';

import { ArchitectureAnalysisSchema } from '../../../architecture-analysis-schema/index.js';
import { analyzeProject } from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/tree/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('analyzeProject', () => {
  test('reads the Module tree out of the files', async () => {
    const analysis = await analyzeProject(fixture('shop')).pipe(
      Effect.runPromise,
    );

    expect(
      analysis.tree.nodes.map(({ path, kind, shape }) => [path, kind, shape]),
    ).toEqual([
      ['.', 'wrapper', 'folder'],
      ['scripts', 'wrapper', 'folder'],
      ['src', 'module', 'folder'],
      ['src/app', 'module', 'folder'],
      ['src/core', 'wrapper', 'folder'],
      ['src/core/ids.ts', 'module', 'file'],
      ['src/domain', 'wrapper', 'folder'],
      ['src/domain/orders', 'module', 'folder'],
      ['src/infra', 'module', 'folder'],
    ]);
    expect(analysis.tree.owners['src/domain/orders/order.ts']).toBe(
      'src/domain/orders',
    );
    expect(analysis.tree.owners['src/domain/pricing.ts']).toBe('src');
    expect(analysis.tree.owners['scripts/seed.ts']).toBe('scripts');
    expect(
      analysis.tree.owners['src/domain/orders/generated.ts'],
    ).toBeUndefined();
  });

  test('gives every import between nodes its verdict', async () => {
    const analysis = await analyzeProject(fixture('shop')).pipe(
      Effect.runPromise,
    );

    expect(
      analysis.imports.map(({ fromFile, toFile, verdict }) => [
        fromFile,
        toFile,
        verdict,
      ]),
    ).toEqual([
      [
        'src/app/index.ts',
        'src/domain/orders/index.ts',
        { kind: 'rule', rule: { from: 'src/app', to: 'src/domain' } },
      ],
      [
        'src/app/index.ts',
        'src/domain/orders/internal.ts',
        { kind: 'violation', reason: 'not-index', remedy: 'none' },
      ],
      [
        'src/app/index.ts',
        'src/infra/index.ts',
        { kind: 'violation', reason: 'no-rule', remedy: 'rule' },
      ],
      [
        'src/domain/orders/order.ts',
        'src/core/ids.ts',
        { kind: 'rule', rule: { from: 'src/domain', to: 'src/core' } },
      ],
      ['src/index.ts', 'src/app/index.ts', { kind: 'nested' }],
      [
        'src/infra/index.ts',
        'src/index.ts',
        {
          kind: 'exception',
          exception: {
            from: 'src/infra',
            to: 'src',
            because:
              'infra boots the app through its door until the composition root moves out',
          },
        },
      ],
    ]);
  });

  test('reports what no Module owns and what nobody uses', async () => {
    const analysis = await analyzeProject(fixture('shop')).pipe(
      Effect.runPromise,
    );

    expect(analysis.findings).toEqual([
      { kind: 'wrapper-coverage', file: 'scripts/seed.ts' },
      { kind: 'unused-rule', rule: { from: 'src/app', to: 'src/core' } },
      { kind: 'unused-rule', rule: { from: 'src/infra', to: 'src/core' } },
    ]);
  });

  test('says an import against a Rule can only be an Exception', async () => {
    const analysis = await analyzeProject(fixture('against-rule')).pipe(
      Effect.runPromise,
    );

    expect(analysis.imports.map(({ verdict }) => verdict)).toEqual([
      { kind: 'rule', rule: { from: 'src/a', to: 'src/b' } },
      { kind: 'violation', reason: 'against-rule', remedy: 'exception' },
    ]);
  });

  test('rejects a Config whose Rules loop', async () => {
    const error = await analyzeProject(fixture('loop')).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error._tag).toBe('ConfigError');
    expect(error).toMatchObject({
      issues: [{ kind: 'loop', message: 'Rule loop: src/a -> src/b -> src/a' }],
    });
  });

  test('round-trips through its runtime schema', async () => {
    const analysis = await analyzeProject(fixture('shop')).pipe(
      Effect.runPromise,
    );
    const codec = Schema.toCodecJson(ArchitectureAnalysisSchema);
    const encoded = Schema.encodeSync(codec)(analysis);
    const decoded = Schema.decodeUnknownSync(codec)(
      JSON.parse(JSON.stringify(encoded)),
    );

    expect(decoded).toEqual(analysis);
  });
});
