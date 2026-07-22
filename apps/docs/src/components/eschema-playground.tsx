import { useEffect, useMemo, useState } from 'react';

/**
 * Interactive demo of eschema's fold-forward decode and latest-only encode.
 *
 * The version chain mirrors the docs' running Message schema (v1 → v4). The
 * simulation follows `std-toolkit/src/eschema/eschema.ts` exactly: a missing
 * `_v` stamp resolves to the first version, decode folds forward through every
 * migration after the stamped version, and encode always writes the latest
 * shape stamped with the latest version.
 */

type Json = Record<string, unknown>;

interface Version {
  id: string;
  delta: string;
  note: string;
  migrate?: (prev: Json) => Json;
}

const chain: Version[] = [
  {
    id: 'v1',
    delta: 'initial shape',
    note: 'channelId, author and body — the whole schema on launch day.',
  },
  {
    id: 'v2',
    delta: '+ reactions',
    note: 'Messages gain emoji reactions. Rows from before the feature get an empty array.',
    migrate: (prev) => ({ ...prev, reactions: [] }),
  },
  {
    id: 'v3',
    delta: 'author → authorId',
    note: 'Display names turned out to be unstable, so the field becomes an id. The migration carries the old value across.',
    migrate: ({ author, ...rest }) => ({ ...rest, authorId: author }),
  },
  {
    id: 'v4',
    delta: '+ editedAt',
    note: 'Messages become editable. A row migrated from an older version was never edited, so null.',
    migrate: (prev) => ({ ...prev, editedAt: null }),
  },
];

const latestIndex = chain.length - 1;
const latestVersion = chain[latestIndex]!.id;

interface DecodeScenario {
  kind: 'decode';
  label: string;
  blurb: string;
  stored: Json;
}

interface EncodeScenario {
  kind: 'encode';
  label: string;
  blurb: string;
}

type Scenario = DecodeScenario | EncodeScenario;

const scenarios: Scenario[] = [
  {
    kind: 'decode',
    label: 'v1 row, three behind',
    blurb:
      'A message written when the schema was brand new. Three migrations stand between what is stored and what your code expects — watch them run, one per step.',
    stored: { _v: 'v1', channelId: 'C7', author: 'ada', body: 'ship it 🚀' },
  },
  {
    kind: 'decode',
    label: 'Legacy row, no _v',
    blurb:
      'Written before eschema was adopted — no version stamp at all. Unstamped rows decode as v1, which is how eschema takes over data that existed before it did.',
    stored: { channelId: 'C7', author: 'grace', body: 'nanoseconds matter' },
  },
  {
    kind: 'decode',
    label: 'v2 row, mid-chain',
    blurb:
      'The fold starts wherever the row stopped. This one already has reactions, so only the v3 and v4 migrations run.',
    stored: {
      _v: 'v2',
      channelId: 'C7',
      author: 'lin',
      body: 'rebased!',
      reactions: ['👍'],
    },
  },
  {
    kind: 'decode',
    label: 'Already at latest',
    blurb:
      'Stamped with the latest version. Decode validates the row and returns it — zero migrations, zero overhead for up-to-date data.',
    stored: {
      _v: 'v4',
      channelId: 'C7',
      authorId: 'U031',
      body: 'lgtm',
      reactions: ['🎉', '👍'],
      editedAt: null,
    },
  },
  {
    kind: 'encode',
    label: 'Encode a message',
    blurb:
      'The write path is the boring half on purpose. Edit the message and watch the encoded row: always the latest shape, always stamped with the latest version.',
  },
];

interface Frame {
  title: string;
  detail: string;
  value: Json;
  at: number;
}

function buildFrames(stored: Json): Frame[] {
  const hadStamp = '_v' in stored;
  const stamp = hadStamp ? String(stored._v) : chain[0]!.id;
  const start = chain.findIndex((v) => v.id === stamp);
  const { _v, ...bare } = stored;
  void _v;

  const frames: Frame[] = [
    {
      title: 'The stored row',
      detail: hadStamp
        ? `The row carries _v: "${stamp}" — the version of the schema that wrote it.`
        : 'No _v stamp anywhere: this row predates eschema itself.',
      value: stored,
      at: -1,
    },
    {
      title: hadStamp
        ? `Read the stamp → start at ${stamp}`
        : 'No stamp → assume v1',
      detail: hadStamp
        ? `Decode validates the row against the ${stamp} fields. The stamp is metadata, so it drops out of the decoded value.`
        : 'A row without _v is treated as the first version and validated against the v1 fields.',
      value: bare,
      at: start,
    },
  ];

  for (let i = start + 1; i < chain.length; i++) {
    const version = chain[i]!;
    frames.push({
      title: `Migrate ${chain[i - 1]!.id} → ${version.id}`,
      detail: version.note,
      value: version.migrate!(frames[frames.length - 1]!.value),
      at: i,
    });
  }

  frames.push(
    start === latestIndex
      ? {
          title: 'Already the latest shape',
          detail:
            'The stamp matches the latest version, so the fold has nothing to do. Decode is validate-and-return.',
          value: frames[frames.length - 1]!.value,
          at: latestIndex,
        }
      : {
          title: `Decoded — the ${latestVersion} shape`,
          detail:
            'This is what your application code receives. It never learns which version the row was stored at.',
          value: frames[frames.length - 1]!.value,
          at: latestIndex,
        },
  );

  return frames;
}

type LineStatus = 'same' | 'added' | 'changed' | 'removed';

interface Line {
  key: string;
  text: string;
  status: LineStatus;
}

const fmt = (value: unknown) => JSON.stringify(value);

function diffLines(value: Json, prev?: Json): Line[] {
  const before = prev ?? value;
  const keys = [
    ...Object.keys(before),
    ...Object.keys(value).filter((key) => !(key in before)),
  ];
  return keys.map((key) => {
    if (!(key in value)) {
      return { key, text: fmt(before[key]), status: 'removed' as const };
    }
    const text = fmt(value[key]);
    if (!prev) return { key, text, status: 'same' as const };
    if (!(key in prev)) return { key, text, status: 'added' as const };
    if (fmt(prev[key]) !== text) {
      return { key, text, status: 'changed' as const };
    }
    return { key, text, status: 'same' as const };
  });
}

const lineStyles: Record<LineStatus, string> = {
  same: '',
  added: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  changed: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  removed:
    'text-red-700/70 line-through decoration-red-700/40 dark:text-red-400/60 dark:decoration-red-400/30',
};

const lineBadges: Partial<Record<LineStatus, string>> = {
  added: 'new',
  changed: 'changed',
  removed: 'dropped',
};

function JsonPanel({
  value,
  prev,
  stamped = false,
}: {
  value: Json;
  prev?: Json;
  stamped?: boolean;
}) {
  const lines = diffLines(value, prev);
  return (
    <div className="animate-in fade-in rounded-lg border bg-fd-background p-3 font-mono text-xs leading-6 duration-300 motion-reduce:animate-none">
      <div className="text-fd-muted-foreground">{'{'}</div>
      {lines.map((line) => {
        const isStamp = stamped && line.key === '_v';
        const badge = isStamp ? 'stamped latest' : lineBadges[line.status];
        return (
          <div
            key={line.key}
            className={`flex items-baseline gap-2 rounded px-2 ${
              isStamp
                ? 'bg-fd-primary/10 text-fd-primary'
                : lineStyles[line.status]
            }`}
          >
            <span className="whitespace-pre pl-2">
              <span
                className={
                  line.key === '_v' && !isStamp ? 'text-fd-primary' : undefined
                }
              >
                &quot;{line.key}&quot;
              </span>
              <span className="text-fd-muted-foreground">: </span>
              {line.text},
            </span>
            {badge && (
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                {badge}
              </span>
            )}
          </div>
        );
      })}
      <div className="text-fd-muted-foreground">{'}'}</div>
    </div>
  );
}

function VersionRail({ at, start }: { at: number; start: number }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {chain.map((version, i) => {
        const state =
          at === -1
            ? 'idle'
            : i === at
              ? 'current'
              : i > at
                ? 'idle'
                : i >= start
                  ? 'done'
                  : 'skipped';
        const migrationRan = at >= i && i > start && at !== -1;
        return (
          <div key={version.id} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <span
                aria-hidden
                className={`text-sm transition-colors duration-300 ${
                  migrationRan
                    ? 'text-fd-primary'
                    : 'text-fd-muted-foreground/40'
                }`}
              >
                →
              </span>
            )}
            <div
              className={`rounded-lg border px-2.5 py-1.5 transition-colors duration-300 ${
                state === 'current'
                  ? 'border-fd-primary bg-fd-primary/10'
                  : state === 'done'
                    ? 'border-fd-primary/40'
                    : state === 'skipped'
                      ? 'border-dashed opacity-50'
                      : ''
              }`}
            >
              <div
                className={`font-mono text-xs font-semibold ${
                  state === 'current' ? 'text-fd-primary' : 'text-fd-foreground'
                }`}
              >
                {version.id}
              </div>
              <div className="text-[10px] text-fd-muted-foreground">
                {version.delta}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const controlButton =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground disabled:pointer-events-none disabled:opacity-40';

function DecodeView({ scenario }: { scenario: DecodeScenario }) {
  const frames = useMemo(() => buildFrames(scenario.stored), [scenario]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = frames[frame]!;
  const prev = frame > 0 ? frames[frame - 1]!.value : undefined;
  const atEnd = frame === frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (frame >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setFrame((f) => f + 1), 1200);
    return () => clearTimeout(timer);
  }, [playing, frame, frames.length]);

  const stamp = '_v' in scenario.stored ? String(scenario.stored._v) : 'v1';
  const start = chain.findIndex((v) => v.id === stamp);

  return (
    <div className="space-y-4 p-4">
      <VersionRail at={current.at} start={start} />

      <div className="grid gap-3 sm:grid-cols-2">
        <JsonPanel key={frame} value={current.value} prev={prev} />
        <div
          key={`n${frame}`}
          className="animate-in fade-in rounded-lg border border-dashed p-3 duration-300 motion-reduce:animate-none"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
            Step {frame + 1} of {frames.length}
          </div>
          <div className="text-sm font-medium">{current.title}</div>
          <p className="mt-1 text-xs leading-5 text-fd-muted-foreground">
            {current.detail}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${controlButton} border-fd-primary/40 text-fd-primary`}
          onClick={() => {
            if (playing) {
              setPlaying(false);
            } else {
              if (atEnd) setFrame(0);
              setPlaying(true);
            }
          }}
        >
          {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button
          type="button"
          className={controlButton}
          disabled={atEnd}
          onClick={() => {
            setPlaying(false);
            setFrame((f) => Math.min(f + 1, frames.length - 1));
          }}
        >
          Step
        </button>
        <button
          type="button"
          className={controlButton}
          disabled={frame === 0}
          onClick={() => {
            setPlaying(false);
            setFrame(0);
          }}
        >
          Reset
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {frames.map((f, i) => (
            <button
              key={f.title}
              type="button"
              aria-label={`Go to step ${i + 1}: ${f.title}`}
              onClick={() => {
                setPlaying(false);
                setFrame(i);
              }}
              className={`size-2 rounded-full transition-colors ${
                i === frame
                  ? 'bg-fd-primary'
                  : i < frame
                    ? 'bg-fd-primary/40'
                    : 'bg-fd-muted-foreground/30 hover:bg-fd-muted-foreground/60'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const reactionOptions = ['👍', '❤️', '🎉', '🚀'];

function EncodeView() {
  const [body, setBody] = useState('deploy is out 🎉');
  const [reactions, setReactions] = useState<string[]>(['🚀']);
  const [edited, setEdited] = useState(false);

  const decoded: Json = {
    channelId: 'C7',
    authorId: 'U031',
    body,
    reactions,
    editedAt: edited ? '2026-07-11T09:12:00Z' : null,
  };
  const encoded: Json = { ...decoded, _v: latestVersion };

  return (
    <div className="space-y-4 p-4">
      <VersionRail at={latestIndex} start={latestIndex} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
            In memory — the decoded value your code edits
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-fd-muted-foreground">body</span>
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-md border bg-fd-background px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-fd-ring"
            />
          </label>
          <div className="text-xs">
            <span className="mb-1 block text-fd-muted-foreground">
              reactions
            </span>
            <div className="flex gap-1.5">
              {reactionOptions.map((emoji) => {
                const active = reactions.includes(emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setReactions((current) =>
                        active
                          ? current.filter((r) => r !== emoji)
                          : [...current, emoji],
                      )
                    }
                    className={`rounded-md border px-2 py-1 transition-colors ${
                      active
                        ? 'border-fd-primary bg-fd-primary/10'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-fd-muted-foreground">
            <input
              type="checkbox"
              checked={edited}
              onChange={(e) => setEdited(e.target.checked)}
            />
            message was edited
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
            encode(message) — the row that hits the database
          </div>
          <JsonPanel value={encoded} stamped />
        </div>
      </div>

      <p className="text-xs leading-5 text-fd-muted-foreground">
        Encode never walks the chain backwards. It validates against the latest
        fields and stamps <code className="font-mono">_v</code> with the latest
        version — even if the row it came from was read as v1 a millisecond ago.
        History only matters on read.
      </p>
    </div>
  );
}

export function ESchemaPlayground() {
  const [index, setIndex] = useState(0);
  const scenario = scenarios[index]!;

  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border bg-fd-card text-sm">
      <div className="flex flex-wrap gap-1.5 border-b bg-fd-muted/50 p-2">
        {scenarios.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              i === index
                ? 'border-fd-primary bg-fd-primary/10 font-medium text-fd-primary'
                : 'border-transparent text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="border-b px-4 py-3 text-xs leading-5 text-fd-muted-foreground sm:text-sm sm:leading-6">
        {scenario.blurb}
      </p>

      {scenario.kind === 'decode' ? (
        <DecodeView key={index} scenario={scenario} />
      ) : (
        <EncodeView />
      )}
    </div>
  );
}
