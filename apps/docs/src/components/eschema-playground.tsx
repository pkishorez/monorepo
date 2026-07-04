import { useState } from 'react';

/**
 * Interactive demo of eschema's fold-forward decode. The version chain and
 * migrations mirror the docs' running example (User: v1 → v2 → v3); the fold
 * itself is the same algorithm the library runs, minus Effect plumbing.
 */

type Json = Record<string, unknown>;

interface Version {
  id: string;
  shape: string;
  note: string;
  migrate?: (prev: Json) => Json;
}

const chain: Version[] = [
  { id: 'v1', shape: '{ name }', note: 'initial shape' },
  {
    id: 'v2',
    shape: '{ name, email }',
    note: 'adds email, defaulted to null',
    migrate: (prev) => ({ ...prev, email: null }),
  },
  {
    id: 'v3',
    shape: '{ fullName, email }',
    note: 'renames name → fullName',
    migrate: ({ name, ...rest }) => ({ ...rest, fullName: name }),
  },
];

interface Scenario {
  label: string;
  summary: string;
  stored: Json;
}

const scenarios: Scenario[] = [
  {
    label: 'Legacy row, no _v',
    summary:
      'Written before eschema existed — no version stamp, so it decodes as v1 and folds forward through every migration.',
    stored: { name: 'Kay' },
  },
  {
    label: 'v1 row',
    summary:
      'Stamped v1. Same path as legacy data: two migrations run on read.',
    stored: { _v: 'v1', name: 'Ada Lovelace' },
  },
  {
    label: 'v2 row',
    summary:
      'Written while v2 was latest. Only the v3 migration runs — the fold starts wherever the row stopped.',
    stored: { _v: 'v2', name: 'Grace Hopper', email: 'grace@navy.mil' },
  },
  {
    label: 'v3 row (latest)',
    summary:
      'Already the latest shape. Decode verifies the stamp and no migration runs.',
    stored: { _v: 'v3', fullName: 'Annie Easley', email: null },
  },
];

function decode(stored: Json) {
  const stamp = (stored._v as string | undefined) ?? 'v1';
  const start = chain.findIndex((v) => v.id === stamp);
  const steps: { to: string; value: Json }[] = [];
  const { _v, ...bare } = stored;
  let value: Json = bare;
  for (const version of chain.slice(start + 1)) {
    value = version.migrate!(value);
    steps.push({ to: version.id, value });
  }
  return { stamp, hadStamp: '_v' in stored, steps, value };
}

const pretty = (value: Json) => JSON.stringify(value, null, 2);

export function ESchemaPlayground() {
  const [index, setIndex] = useState(0);
  const scenario = scenarios[index];
  const result = decode(scenario.stored);

  return (
    <div className="not-prose my-6 rounded-lg border bg-fd-card text-sm">
      <div className="flex flex-wrap gap-2 border-b p-3">
        {scenarios.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setIndex(i)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              i === index
                ? 'border-fd-primary bg-fd-primary/10 text-fd-primary'
                : 'text-fd-muted-foreground hover:bg-fd-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="border-b p-3 text-fd-muted-foreground">
        {scenario.summary}
      </p>

      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
            Stored record
          </div>
          <pre className="overflow-x-auto rounded-md bg-fd-muted p-3 text-xs">
            {pretty(scenario.stored)}
          </pre>
          {!result.hadStamp && (
            <p className="mt-1.5 text-xs text-fd-muted-foreground">
              No <code>_v</code> stamp → treated as <code>v1</code>.
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
            Decoded (latest shape)
          </div>
          <pre className="overflow-x-auto rounded-md bg-fd-muted p-3 text-xs">
            {pretty(result.value)}
          </pre>
        </div>
      </div>

      <div className="border-t p-3">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          Fold-forward on read
        </div>
        <ol className="space-y-1 text-xs text-fd-muted-foreground">
          <li>
            1. Read stamp:{' '}
            <code>{result.hadStamp ? result.stamp : 'none → v1'}</code>
          </li>
          {result.steps.length === 0 ? (
            <li>2. Already latest — no migration runs.</li>
          ) : (
            result.steps.map((step, i) => (
              <li key={step.to}>
                {i + 2}. Migrate → <code>{step.to}</code> (
                {chain.find((v) => v.id === step.to)!.note}) →{' '}
                <code>{JSON.stringify(step.value)}</code>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
