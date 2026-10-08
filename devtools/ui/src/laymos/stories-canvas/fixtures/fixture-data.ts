import type {
  CapturedTrace,
  PhaseReport,
  ProofLeaf,
  ProofReport,
  Recording,
  Step,
  StoryNode,
  StoryTree,
  TellingIssue,
} from 'laymos/story/schema';

import { recordFrames } from './recording-frames';

const evidenceFiles = new Map<string, string>();

export function fixtureEvidenceUrl(proofId: string, file: string): string {
  return evidenceFiles.get(`${proofId}/${file}`) ?? '';
}

// ── The Story tree ──────────────────────────────────────────────────────

function proof(
  storyId: string,
  name: string,
  title: string,
  options: {
    readonly venue?: 'process' | 'browser';
    readonly critical?: boolean;
    readonly description?: string;
  } = {},
): ProofLeaf {
  const venue = options.venue ?? 'process';
  const path = `stories/${storyId.split('/').slice(1).concat(name).join('/')}.proof.ts`;
  return {
    id: `${storyId}/${name}`,
    name,
    title,
    description: options.description ?? null,
    venue,
    critical: options.critical ?? false,
    source: { path, content: proofSource(title, venue, options.critical) },
  };
}

function story(
  id: string,
  telling: {
    readonly title?: string;
    readonly pitch?: string;
    readonly body?: string;
  },
  parts: {
    readonly stories?: readonly StoryNode[];
    readonly proofs?: readonly ProofLeaf[];
    readonly issues?: readonly TellingIssue[];
  } = {},
): StoryNode {
  const name = id.split('/').at(-1)!;
  return {
    id,
    name,
    path: id.split('/').slice(1).join('/'),
    title: telling.title ?? name,
    pitch: telling.pitch ?? '',
    body: telling.body ?? '',
    stories: parts.stories ?? [],
    proofs: parts.proofs ?? [],
    issues: parts.issues ?? [],
  };
}

function proofSource(
  title: string,
  venue: 'process' | 'browser',
  critical = false,
): string {
  if (venue === 'browser') {
    return `import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { mountTodoApp } from '@kstackz/std-toolkit/demo';

export default Proof.browser({
  title: '${title}',${critical ? '\n  critical: true,' : ''}
  page: (root) => mountTodoApp(root),
  prepare: (browser) =>
    Effect.gen(function* () {
      const laptop = yield* browser.open('desktop', 'Laptop');
      const phone = yield* browser.open('mobile', 'Phone');
      return { laptop, phone };
    }),
  act: ({ laptop, phone }) =>
    Effect.gen(function* () {
      yield* laptop.click('focus the task input', 'role=textbox');
      yield* laptop.type('type a task', 'role=textbox', 'Water the plants');
      yield* laptop.click('add the task', 'text=Add');
      yield* phone.waitFor('the task arrives on the phone', 'text=Water the plants');
      return yield* phone.count('role=listitem');
    }),
  verify: (count) => Proof.assert('the phone lists three tasks', count === 3),
});
`;
  }
  return `import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { EvolvingSchema } from '@kstackz/std-toolkit/evolving-schema';

const User = EvolvingSchema.make('User')
  .version('v1', { name: 'string' })
  .version('v3', { name: 'string', age: 'number' }, (v1) => ({ ...v1, age: 0 }));

export default Proof.make({
  title: '${title}',${critical ? '\n  critical: true,' : ''}
  prepare: Effect.gen(function* () {
    const stored = { _v: 'v1', name: 'Ada' };
    yield* Proof.assert('the row is stored as v1', stored._v === 'v1');
    return stored;
  }),
  act: (stored) => User.decode(stored),
  verify: (user) =>
    Effect.gen(function* () {
      yield* Proof.assert('the user reads as v3', user._v === 'v3');
      yield* Proof.assert('age is filled in with 0', user.age === 0);
    }),
});
`;
}

const top = 'std-toolkit';
const evolving = `${top}/evolving-schema`;
const migrations = `${evolving}/migrations`;
const snapshot = `${evolving}/snapshot`;
const entities = `${top}/entities`;
const many = `${entities}/many-of-a-kind`;
const one = `${entities}/exactly-one`;
const adapters = `${top}/adapters`;
const tables = `${adapters}/tables`;
const sync = `${top}/sync`;

export const storyTree: StoryTree = story(
  top,
  {
    title: 'std-toolkit',
    pitch:
      'Describe your records once and keep reading them as they change, on the server, in the browser, and on every device.',
    body: `Your app's data outlives its first design. Fields get added, renamed, split; a phone that was offline for a week comes back with rows from last month's release. Without help, every change becomes a migration script and a deploy you are nervous about.

With std-toolkit you describe each kind of record as an [evolving schema](${evolving}): every version it has had, and how to step from one to the next. You choose whether you keep [many of a kind or exactly one](${entities}), and save them through an [adapter](${adapters}) to the database you already run. [Sync](${sync}) then keeps every device looking at the same records.

What you get: [rows written by last year's release still read](${top}/old-data-reads-after-an-upgrade), and [a change on one device reaches the others](${top}/a-task-reaches-every-device). Caching reads near the user is planned as its own part: see [caching](${top}/caching).`,
  },
  {
    stories: [
      story(
        evolving,
        {
          title: 'Evolving schema',
          pitch:
            'Change your data’s shape whenever you like; rows written years ago still read correctly.',
          body: `Each change you make becomes a new version of the schema. You never rewrite stored rows: every change becomes a [migration](${migrations}) that runs as old rows are read, so nothing has to happen up front.

\`\`\`ts
User.version('v2', { name, age }, (v1) => ({ ...v1, age: 0 }))
\`\`\`

To keep yourself honest, a [snapshot](${snapshot}) pins the shape each release shipped, so an accidental edit to an old version fails your build instead of your users. You can count on [an old row reading as the newest version](${evolving}/old-rows-still-read), and on [a version nobody declared being refused](${evolving}/unknown-version-is-rejected).`,
        },
        {
          stories: [
            story(
              migrations,
              {
                title: 'Migrations',
                pitch:
                  'Step a record forward one version at a time, filling in what older rows never had.',
                body: `A migration takes a row of one version and returns the next. You write only the step; the chain runs itself, so [three steps apply in order](${migrations}/chain-of-three) and [a new field gets its default](${migrations}/backfills-a-default).

If a step throws, [the read stops with that error](${migrations}/a-throwing-step-stops-the-read) rather than handing you half a record.`,
              },
              {
                proofs: [
                  proof(
                    migrations,
                    'chain-of-three',
                    'Three migrations apply in the order they were declared',
                  ),
                  proof(
                    migrations,
                    'backfills-a-default',
                    'A field added in v2 is filled in with its default on old rows',
                  ),
                  proof(
                    migrations,
                    'a-throwing-step-stops-the-read',
                    'A step that throws stops the read with that error',
                  ),
                ],
              },
            ),
            story(
              snapshot,
              {
                title: 'Snapshot',
                pitch:
                  'Pin the shape each release shipped, so editing an old version breaks your build, not your users.',
                body: `Run the snapshot once per release and commit it. From then on, [the snapshot must match the schema](${snapshot}/snapshot-matches-the-schema) for every version you already shipped; new versions are free to change.`,
              },
              {
                proofs: [
                  proof(
                    snapshot,
                    'snapshot-matches-the-schema',
                    'An edit to a shipped version fails against its snapshot',
                  ),
                ],
              },
            ),
          ],
          proofs: [
            proof(
              evolving,
              'old-rows-still-read',
              'A row written by version 1 reads as version 3',
              {
                critical: true,
                description:
                  'Rows written by an older release must still read as the current shape, or every deploy breaks stored data.',
              },
            ),
            proof(
              evolving,
              'unknown-version-is-rejected',
              'A version that was never declared is refused with its name',
            ),
          ],
        },
      ),
      story(
        entities,
        {
          title: 'Entities',
          pitch:
            'Keep many records of a kind, or exactly one, with the same few calls.',
          body: `Most records come in collections: tasks, users, invoices. Those are [many of a kind](${many}), each with its own id, listed and queried together.

Some things exist once per app or per user, like settings. You can keep those too, without inventing an id for them.`,
        },
        {
          stories: [
            story(
              many,
              {
                title: 'Many of a kind',
                pitch:
                  'Save, list, and remove records that share a schema, each under its own id.',
                body: `You get back exactly what you saved: [an inserted record shows up in the list](${many}/insert-then-list) in the order you asked for.`,
              },
              {
                proofs: [
                  proof(
                    many,
                    'insert-then-list',
                    'A record you insert shows up when you list',
                  ),
                ],
              },
            ),
            story(
              one,
              {},
              {
                proofs: [
                  proof(
                    one,
                    'settings-are-one-row',
                    'Saving settings twice keeps one row',
                  ),
                ],
                issues: [
                  {
                    kind: 'missing-telling',
                    target: null,
                    message: 'entities/exactly-one has no story.md.',
                  },
                ],
              },
            ),
          ],
          issues: [
            {
              kind: 'unnamed-part',
              target: one,
              message: `The Telling never links ${one}.`,
            },
          ],
        },
      ),
      story(
        adapters,
        {
          title: 'Adapters',
          pitch:
            'Save records in the database you already run, with no new service to operate.',
          body: `An adapter turns your schema's reads and writes into your database's own calls. Today that means [tables](${tables}); each adapter keeps the same promises, so moving between them never changes your app code.`,
        },
        {
          stories: [
            story(
              tables,
              {
                title: 'Tables',
                pitch:
                  'Keep each kind of record in a table, with indexes and pages that behave the same everywhere.',
                body: `[An inserted row comes back from a query](${tables}/insert-then-query), and [a unique index turns a duplicate away](${tables}/unique-index-rejects-duplicates). When you [write several changes together](${tables}/writing-several-changes-together), all of them land or none do.

Long lists come in pages: [a cursor survives an insert before it](${tables}/cursor-survives-insert), and [a page is never bigger than 100 rows](${tables}/page-size-is-capped).`,
              },
              {
                proofs: [
                  proof(
                    tables,
                    'insert-then-query',
                    'An inserted row comes back from a query',
                  ),
                  proof(
                    tables,
                    'unique-index-rejects-duplicates',
                    'A unique index turns away a duplicate key',
                  ),
                  proof(
                    tables,
                    'writing-several-changes-together',
                    'Several changes written together all land or none do',
                    {
                      critical: true,
                    },
                  ),
                  proof(
                    tables,
                    'cursor-survives-insert',
                    'A page cursor survives a row inserted before it',
                  ),
                  proof(
                    tables,
                    'page-size-is-capped',
                    'A page never holds more than 100 rows',
                  ),
                ],
              },
            ),
          ],
        },
      ),
      story(
        sync,
        {
          title: 'Sync',
          pitch:
            'Every device signed in as you sees the same records, even after time offline.',
          body: `You change a record on one device and carry on. [Edits made offline replay when you reconnect](${sync}/offline-edit-replays), in the order you made them.

On a phone, [swiping a task away archives it everywhere](${sync}/swipe-to-archive), and the other devices follow within a second.`,
        },
        {
          proofs: [
            proof(
              sync,
              'offline-edit-replays',
              'An edit made offline reaches the server after reconnecting',
              {
                venue: 'browser',
                critical: true,
                description:
                  'A user who edits on a plane must find the edit everywhere once they land.',
              },
            ),
            proof(
              sync,
              'swipe-to-archive',
              'Swiping a task left archives it on every device',
              {
                venue: 'browser',
              },
            ),
          ],
        },
      ),
    ],
    proofs: [
      proof(
        top,
        'old-data-reads-after-an-upgrade',
        'Data saved by last year’s release reads after an upgrade',
        {
          critical: true,
        },
      ),
      proof(
        top,
        'a-task-reaches-every-device',
        'A task added on the laptop appears on the phone',
        {
          venue: 'browser',
          description:
            'Two Devices signed in as one user see the same list within a second.',
        },
      ),
    ],
    issues: [
      {
        kind: 'broken-link',
        target: `${top}/caching`,
        message: `No Story or Proof has the id ${top}/caching.`,
      },
    ],
  },
);

// ── Proof reports ───────────────────────────────────────────────────────

const epoch = Date.UTC(2026, 9, 8, 9, 30);

function phase(
  name: PhaseReport['phase'],
  startedAt: number,
  endedAt: number,
  rest: Partial<Omit<PhaseReport, 'phase' | 'startedAt' | 'endedAt'>> = {},
): PhaseReport {
  return {
    phase: name,
    status: 'passed',
    startedAt,
    endedAt,
    assertions: [],
    ...rest,
  };
}

function processReport(
  id: string,
  verdict: ProofReport['verdict'],
  phases: readonly PhaseReport[],
  trace: CapturedTrace | null = null,
): ProofReport {
  return {
    id,
    verdict,
    startedAt: epoch,
    duration: Math.max(...phases.map((entry) => entry.endedAt)),
    phases,
    trace,
    steps: [],
    recordings: [],
  };
}

function span(
  spanId: string,
  parentSpanId: string | null,
  name: string,
  start: number,
  end: number,
  attributes: Record<string, string | number> = {},
) {
  return {
    traceId: 'trace-decode',
    spanId,
    parentSpanId,
    name,
    startTime: epoch + start,
    endTime: epoch + end,
    status: 'success' as const,
    attributes,
    events: [],
  };
}

const decodeTrace: CapturedTrace = {
  spans: [
    span('proof', null, 'Story', 0, 18.4),
    span('prepare', 'proof', 'prepare', 0.2, 2.1),
    span('act', 'proof', 'act', 2.3, 14.8),
    span('decode', 'act', 'User.decode', 2.5, 14.5, {
      'schema.from': 'v1',
      'schema.to': 'v3',
    }),
    span('m1', 'decode', 'migrate v1 → v2', 3.1, 7.9),
    span('m2', 'decode', 'migrate v2 → v3', 8.2, 13.6),
    span('verify', 'proof', 'verify', 15, 18.1),
  ],
  logs: [
    {
      id: 'log-1',
      spanId: 'm2',
      timestamp: epoch + 9,
      level: 'Debug',
      message: 'filling in age with its default 0',
      annotations: {},
    },
  ],
  truncated: false,
};

const desktopViewport = { width: 1280, height: 800 };
const mobileViewport = { width: 412, height: 839 };

function step(
  name: string,
  kind: Step['kind'],
  tab: string,
  startedAt: number,
  endedAt: number,
  rest: Partial<Pick<Step, 'phase' | 'passed' | 'error'>> = {},
): Step {
  return {
    name,
    kind,
    tab,
    phase: rest.phase ?? 'act',
    startedAt,
    endedAt,
    passed: rest.passed ?? true,
    ...(rest.error === undefined ? {} : { error: rest.error }),
    screenshot: null,
  };
}

function recording(
  proofId: string,
  tab: string,
  device: string,
  deviceKind: Recording['deviceKind'],
  openedAt: number,
  closedAt: number,
  scene: Parameters<typeof recordFrames>[0],
): Recording {
  const prefix = tab.toLowerCase().replace(/\s+/g, '-');
  const scoped = new Map<string, string>();
  const frames = recordFrames(scene, openedAt, closedAt, prefix, scoped);
  for (const [file, url] of scoped)
    evidenceFiles.set(`${proofId}/${file}`, url);
  return {
    tab,
    device,
    deviceKind,
    viewport: deviceKind === 'mobile' ? mobileViewport : desktopViewport,
    openedAt,
    closedAt,
    frames,
  };
}

const baseItems = [
  { label: 'Buy oat milk', at: 0 },
  { label: 'Book the dentist', at: 0 },
];

const everyDeviceId = `${top}/a-task-reaches-every-device`;
const everyDeviceReport: ProofReport = {
  id: everyDeviceId,
  verdict: 'passed',
  startedAt: epoch,
  duration: 7200,
  phases: [
    phase('prepare', 0, 1350),
    phase('act', 1350, 6400, { value: 3 }),
    phase('verify', 6400, 6600, {
      assertions: [
        { description: 'the phone lists three tasks', passed: true },
      ],
    }),
  ],
  trace: null,
  steps: [
    step('open the laptop', 'open', 'Laptop', 300, 900, { phase: 'prepare' }),
    step('open the phone', 'open', 'Phone', 700, 1300, { phase: 'prepare' }),
    step('focus the task input', 'click', 'Laptop', 1400, 2100),
    step('type a task', 'type', 'Laptop', 2150, 3000),
    step('add the task', 'click', 'Laptop', 3050, 3700),
    step('the task arrives on the phone', 'wait', 'Phone', 3700, 4300),
    step('tap the new task', 'gesture', 'Phone', 4700, 5400),
    step('the phone after the sync', 'screenshot', 'Phone', 5900, 6300),
  ],
  recordings: [
    recording(everyDeviceId, 'Laptop', 'Desktop 1', 'desktop', 300, 7000, {
      kind: 'desktop',
      title: 'Tasks',
      items: [...baseItems, { label: 'Water the plants', at: 3600 }],
      typed: { text: 'Water the plants', from: 2200, to: 2950 },
      pointer: [
        { x: 900, y: 600, at: 1400 },
        { x: 520, y: 134, at: 2000 },
        { x: 520, y: 134, at: 3050 },
        { x: 1000, y: 134, at: 3550 },
        { x: 1080, y: 360, at: 4400 },
      ],
      pressedDuring: [
        [2000, 2120],
        [3550, 3680],
      ],
    }),
    recording(everyDeviceId, 'Phone', 'Pixel 7', 'mobile', 700, 7000, {
      kind: 'mobile',
      title: 'Tasks',
      items: [...baseItems, { label: 'Water the plants', at: 4150 }],
      pointer: [
        { x: 200, y: 360, at: 4700 },
        { x: 210, y: 352, at: 5400 },
      ],
      pressedDuring: [[4700, 5400]],
    }),
  ],
};

const offlineId = `${sync}/offline-edit-replays`;
const offlineReport: ProofReport = {
  id: offlineId,
  verdict: 'failed',
  startedAt: epoch,
  duration: 5200,
  phases: [
    phase('prepare', 0, 900),
    phase('act', 900, 4300, { value: ['Buy oat milk', 'Book the dentist'] }),
    phase('verify', 4300, 4500, {
      status: 'failed',
      assertions: [
        { description: 'the offline edit is kept on the laptop', passed: true },
        {
          description: 'the edit reaches the server after reconnecting',
          passed: false,
        },
      ],
    }),
  ],
  trace: null,
  steps: [
    step('open the laptop', 'open', 'Laptop', 200, 800, { phase: 'prepare' }),
    step('go offline', 'raw', 'Laptop', 1000, 1100),
    step('type a task', 'type', 'Laptop', 1300, 2200),
    step('add the task', 'click', 'Laptop', 2250, 2800),
    step('go back online', 'raw', 'Laptop', 3000, 3100),
    step('the sync badge clears', 'wait', 'Laptop', 3100, 4200, {
      passed: false,
      error: 'Timed out after 1000 ms waiting for text=Synced',
    }),
  ],
  recordings: [
    recording(offlineId, 'Laptop', 'Desktop 1', 'desktop', 200, 4800, {
      kind: 'desktop',
      title: 'Tasks · offline',
      items: [...baseItems, { label: 'Call the plumber', at: 2700 }],
      typed: { text: 'Call the plumber', from: 1350, to: 2150 },
      pointer: [
        { x: 700, y: 500, at: 1200 },
        { x: 520, y: 134, at: 1300 },
        { x: 520, y: 134, at: 2250 },
        { x: 1000, y: 134, at: 2650 },
      ],
      pressedDuring: [[2650, 2780]],
    }),
  ],
};

const swipeId = `${sync}/swipe-to-archive`;
const swipeReport: ProofReport = {
  id: swipeId,
  verdict: 'passed',
  startedAt: epoch,
  duration: 3900,
  phases: [
    phase('prepare', 0, 800),
    phase('act', 800, 3200, {
      value: { archived: ['Buy oat milk'], remaining: 1 },
    }),
    phase('verify', 3200, 3300, {
      assertions: [{ description: 'one task remains', passed: true }],
    }),
  ],
  trace: null,
  steps: [
    step('open the phone', 'open', 'Phone', 200, 750, { phase: 'prepare' }),
    step('swipe the first task left', 'gesture', 'Phone', 1200, 1900),
    step('the archive toast shows', 'wait', 'Phone', 1900, 2600),
  ],
  recordings: [
    recording(swipeId, 'Phone', 'Pixel 7', 'mobile', 200, 3600, {
      kind: 'mobile',
      title: 'Tasks',
      items: baseItems,
      pointer: [
        { x: 340, y: 202, at: 1200 },
        { x: 60, y: 202, at: 1900 },
      ],
      pressedDuring: [[1200, 1900]],
      swipe: { item: 0, from: 1200, to: 1900 },
    }),
  ],
};

const decodePhases = [
  phase('prepare', 0.2, 2.1, {
    value: { _v: 'v1', name: 'Ada' },
    assertions: [{ description: 'the row is stored as v1', passed: true }],
  }),
  phase('act', 2.3, 14.8, {
    value: { _v: 'v3', name: 'Ada', age: 0, tags: [] },
  }),
  phase('verify', 15, 18.1, {
    assertions: [
      { description: 'the user reads as v3', passed: true },
      { description: 'age is filled in with 0', passed: true },
    ],
  }),
];

const reports: readonly ProofReport[] = [
  processReport(
    `${top}/old-data-reads-after-an-upgrade`,
    'passed',
    decodePhases,
    decodeTrace,
  ),
  everyDeviceReport,
  processReport(
    `${evolving}/old-rows-still-read`,
    'passed',
    decodePhases,
    decodeTrace,
  ),
  processReport(`${evolving}/unknown-version-is-rejected`, 'failed', [
    phase('prepare', 0, 1.2, { value: { _v: 'v9', name: 'Eve' } }),
    phase('act', 1.4, 6.3, {
      value: {
        _tag: 'ParseError',
        message: 'Expected "v1" | "v2" | "v3", got "v9"',
      },
    }),
    phase('verify', 6.5, 7.2, {
      status: 'failed',
      assertions: [
        { description: 'decoding fails', passed: true },
        {
          description: 'the error names the unknown version v9',
          passed: false,
        },
      ],
    }),
  ]),
  processReport(`${migrations}/backfills-a-default`, 'passed', [
    phase('prepare', 0, 1),
    phase('act', 1, 4, { value: 0 }),
    phase('verify', 4, 4.6, {
      assertions: [{ description: 'age defaults to 0', passed: true }],
    }),
  ]),
  processReport(`${migrations}/a-throwing-step-stops-the-read`, 'errored', [
    phase('prepare', 0, 0.8),
    phase('act', 0.8, 3.1, {
      status: 'errored',
      error:
        'MigrationError: step v2 → v3 threw\n    at migrate (std-toolkit/src/evolving-schema/migrate.ts:41:13)\n    Caused by: TypeError: Cannot read properties of undefined (reading "split")',
    }),
    phase('verify', 3.1, 3.1, { status: 'skipped' }),
  ]),
  processReport(`${snapshot}/snapshot-matches-the-schema`, 'passed', [
    phase('prepare', 0, 3),
    phase('act', 3, 9, { value: { shipped: ['v1', 'v2'], changed: [] } }),
    phase('verify', 9, 9.4, {
      assertions: [{ description: 'no shipped version changed', passed: true }],
    }),
  ]),
  processReport(`${many}/insert-then-list`, 'passed', [
    phase('prepare', 0, 12),
    phase('act', 12, 30, {
      value: [{ id: 't_01', title: 'Water the plants' }],
    }),
    phase('verify', 30, 31, {
      assertions: [
        { description: 'the list holds the new task', passed: true },
      ],
    }),
  ]),
  processReport(`${one}/settings-are-one-row`, 'passed', [
    phase('prepare', 0, 8),
    phase('act', 8, 21, { value: { theme: 'dark', rows: 1 } }),
    phase('verify', 21, 22, {
      assertions: [{ description: 'one settings row exists', passed: true }],
    }),
  ]),
  processReport(`${tables}/insert-then-query`, 'passed', [
    phase('prepare', 0, 34, { value: { table: 'tasks', rows: 0 } }),
    phase('act', 34, 61, {
      value: [{ id: 't_01', title: 'Water the plants', done: false }],
    }),
    phase('verify', 61, 63, {
      assertions: [
        { description: 'the query returns the inserted row', passed: true },
      ],
    }),
  ]),
  processReport(`${tables}/unique-index-rejects-duplicates`, 'errored', [
    phase('prepare', 0, 22),
    phase('act', 22, 41, {
      status: 'errored',
      error:
        'DynamoDBError: ConditionalCheckFailedException\n    at putItem (std-table/src/dynamo/client.ts:118:11)\n    at insertUnique (std-table/src/table/write.ts:52:7)',
    }),
    phase('verify', 41, 41, { status: 'skipped' }),
  ]),
  processReport(`${tables}/writing-several-changes-together`, 'passed', [
    phase('prepare', 0, 18),
    phase('act', 18, 52, { value: { written: 3, refused: 0 } }),
    phase('verify', 52, 54, {
      assertions: [
        { description: 'all three rows are stored', passed: true },
        { description: 'a refused batch stores nothing', passed: true },
      ],
    }),
  ]),
  processReport(`${tables}/cursor-survives-insert`, 'unprepared', [
    phase('prepare', 0, 12, {
      status: 'failed',
      assertions: [{ description: 'the table holds 250 rows', passed: false }],
      value: { rows: 100 },
    }),
    phase('act', 12, 12, { status: 'skipped' }),
    phase('verify', 12, 12, { status: 'skipped' }),
  ]),
  processReport(`${tables}/page-size-is-capped`, 'passed', [
    phase('prepare', 0, 40),
    phase('act', 40, 77, { value: { requested: 500, returned: 100 } }),
    phase('verify', 77, 78, {
      assertions: [
        { description: 'a page holds at most 100 rows', passed: true },
      ],
    }),
  ]),
  offlineReport,
  swipeReport,
];

/** Saved reports for every Proof but `chain-of-three`, which has never run. */
export const proofReports: Readonly<Record<string, ProofReport>> =
  Object.fromEntries(reports.map((report) => [report.id, report]));
