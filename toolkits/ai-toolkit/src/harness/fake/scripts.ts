/*
 * Scripts: what the Agent fake replies, one Step after another, then how
 * it ends. A Script says what the agent does, not how a harness writes
 * it: each harness's records (claude.ts, codex.ts) turn every Step into
 * the records the real Claude Code or Codex writes for it, as the
 * fixtures recorded from them show (`../claude/project/tests/fixtures`,
 * `../codex/project/tests/fixtures`), so the real projections draw them.
 *
 * The library holds one Script per thing Code draws: words, each tool
 * kind, a subagent and a nested one, a question, Background Jobs, a plan,
 * compaction, and each ending. With none chosen, a reply is an echo.
 */

/** A file's change, or a command's output, as a tool gives it back. */
interface ToolEnd {
  /** The tool failed, saying this; its output is ignored. */
  readonly fails?: string;
}

/** One thing the agent does in a reply. */
export type Step =
  /** Words, streamed a few sentences at a time. */
  | { readonly _tag: 'Say'; readonly text: string }
  /** Reasoning, streamed, shown folded. */
  | { readonly _tag: 'Think'; readonly text: string }
  | ({
      readonly _tag: 'Read';
      readonly path: string;
      readonly text: string;
      /** Images the read gave back, base64. */
      readonly images?: ReadonlyArray<{
        readonly mediaType: string;
        readonly data: string;
      }>;
    } & ToolEnd)
  | ({
      readonly _tag: 'Write';
      readonly path: string;
      readonly content: string;
    } & ToolEnd)
  | ({
      readonly _tag: 'Edit';
      readonly path: string;
      readonly before: string;
      readonly after: string;
    } & ToolEnd)
  | ({ readonly _tag: 'Delete'; readonly path: string } & ToolEnd)
  | ({
      readonly _tag: 'Bash';
      readonly command: string;
      readonly output: string;
    } & ToolEnd)
  | ({
      readonly _tag: 'Search';
      readonly pattern: string;
      readonly path: string;
      readonly output: string;
    } & ToolEnd)
  | ({
      readonly _tag: 'Web';
      readonly query: string;
      readonly url: string;
      readonly output: string;
    } & ToolEnd)
  | ({
      readonly _tag: 'Mcp';
      readonly server: string;
      readonly tool: string;
      readonly input: Readonly<Record<string, string>>;
      readonly output: string;
    } & ToolEnd)
  | ({
      readonly _tag: 'Other';
      readonly name: string;
      readonly description: string;
      readonly output: string;
    } & ToolEnd)
  /** A plan as a checklist: Claude's todo, Codex's plan. */
  | {
      readonly _tag: 'Plan';
      readonly items: ReadonlyArray<{
        readonly step: string;
        readonly status: 'pending' | 'in_progress' | 'completed';
      }>;
    }
  /** A subagent doing `steps` for `task`, reporting `report`. */
  | {
      readonly _tag: 'Subagent';
      readonly task: string;
      readonly prompt: string;
      readonly steps: ReadonlyArray<Step>;
      readonly report: string;
    }
  /** An Agent Question: the reply waits for its answer, then says what it heard. */
  | {
      readonly _tag: 'Ask';
      readonly items: ReadonlyArray<{
        readonly header: string;
        readonly question: string;
        readonly options: ReadonlyArray<{
          readonly label: string;
          readonly description: string;
        }>;
        readonly multiSelect?: boolean;
        readonly secret?: boolean;
      }>;
    }
  /**
   * A Background Job: a shell command, or a subagent, that runs on after
   * the reply, writing `output`, until a Control ends it.
   */
  | {
      readonly _tag: 'Job';
      readonly kind: 'shell' | 'agent';
      readonly title: string;
      readonly output: ReadonlyArray<string>;
    }
  /** The context was compacted. */
  | { readonly _tag: 'Compact' }
  /** The harness reports a problem it carries on from (Codex's `error`). */
  | { readonly _tag: 'Problem'; readonly message: string }
  /** The context fills to this many tokens. */
  | { readonly _tag: 'Fill'; readonly usedTokens: number }
  /** Nothing for a while, as the agent thinks. */
  | { readonly _tag: 'Pause'; readonly ms: number };

/** How a reply ends. */
export type Ending =
  | { readonly _tag: 'Done' }
  /** The harness ends the turn failed, saying why. */
  | { readonly _tag: 'Failed'; readonly reason: string }
  /** The harness's process exits mid-reply: its stream fails. */
  | { readonly _tag: 'CutOff' };

/** The names a Control picks a Script by: `echo`, then the library's. */
export const SCRIPT_NAMES = [
  'echo',
  'words',
  'every tool',
  'plan',
  'subagent',
  'question',
  'secret',
  'background jobs',
  'compaction',
  'long',
  'fails',
  'cut off',
] as const;
export type ScriptName = (typeof SCRIPT_NAMES)[number];

export interface Script {
  readonly name: ScriptName | 'job report';
  /** What it shows, in a few words, for the bubble. */
  readonly about: string;
  readonly steps: ReadonlyArray<Step>;
  readonly ending: Ending;
  /** Tokens the reply used, as its end says. */
  readonly usage: {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
  };
}

const DONE: Ending = { _tag: 'Done' };
const USAGE = { input: 1_200, output: 640, cacheRead: 24_800 };

/** A reply that says `text` and ends done: the echo, and the Agent-started Turn's report. */
export const sayOnly = (name: Script['name'], text: string): Script => ({
  name,
  about: 'says one thing',
  steps: [{ _tag: 'Say', text }],
  ending: DONE,
  usage: { input: 40, output: 12, cacheRead: 0 },
});

const WORDS = [
  'Here is what I found. The session store keeps every Turn as a row, keyed by its Session and the time it started.',
  'Each row holds the prompt, the model it ran on, and how it ended; nothing else is copied there.',
  '\n\n## What changes\n\n1. `store.ts` gains `byStatus`, so the sidebar can count running Sessions.\n2. `turns.ts` reads it instead of scanning.\n\n```ts\nexport const byStatus = (status: Status) =>\n  rows.filter((row) => row.status === status);\n```\n',
  'The rest stays as it is. See [the design notes](https://example.com/notes) for why the index is kept apart.',
].join(' ');

/** A tiny PNG, 2×2, for a read that gives an image back. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgAQYGBgA/AwIBJ4N9KQAAAABJRU5ErkJggg==';

const LONG_OUTPUT = Array.from(
  { length: 160 },
  (_, line) =>
    `✓ src/feature-${line}.test.ts (${(line % 7) + 2} tests) ${(line * 13) % 90}ms`,
).join('\n');

/** The library, by name. */
export const SCRIPTS: ReadonlyArray<Script> = [
  {
    name: 'words',
    about: 'Markdown, code and a link, streamed, after a thought',
    steps: [
      {
        _tag: 'Think',
        text: 'The user wants the store explained. I should read it first, then say what changes.',
      },
      { _tag: 'Say', text: WORDS },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'every tool',
    about: 'read, search, edit, write, delete, bash, web, mcp, other',
    steps: [
      { _tag: 'Say', text: 'I will look around first.' },
      {
        _tag: 'Read',
        path: 'src/store.ts',
        text: '     1\texport const rows: Array<Row> = [];\n     2\texport const add = (row: Row) => rows.push(row);\n',
      },
      {
        _tag: 'Search',
        pattern: 'rows\\.filter',
        path: 'src',
        output: 'src/turns.ts:12:  return rows.filter((row) => row.done);',
      },
      {
        _tag: 'Edit',
        path: 'src/turns.ts',
        before: '  return rows.filter((row) => row.done);',
        after: "  return byStatus('done');",
      },
      {
        _tag: 'Write',
        path: 'src/status.ts',
        content: "export type Status = 'running' | 'done' | 'failed';\n",
      },
      { _tag: 'Delete', path: 'src/old-index.ts' },
      { _tag: 'Bash', command: 'pnpm test', output: LONG_OUTPUT },
      {
        _tag: 'Web',
        query: 'sqlite partial index',
        url: 'https://sqlite.org/partialindex.html',
        output:
          'A partial index is an index over a subset of the rows of a table.',
      },
      {
        _tag: 'Mcp',
        server: 'github',
        tool: 'search_issues',
        input: { query: 'store index' },
        output: '#412 Sidebar is slow with many Sessions',
      },
      {
        _tag: 'Other',
        name: 'Skill',
        description: 'Run the review skill',
        output: 'Launching skill: review',
      },
      {
        _tag: 'Read',
        path: 'docs/screenshot.png',
        text: '',
        images: [
          { mediaType: 'image/png', data: PNG },
          { mediaType: 'image/png', data: PNG },
        ],
      },
      {
        _tag: 'Bash',
        command: 'pnpm lint',
        output: '',
        fails: 'src/turns.ts:3:1 error Unused import "Row"',
      },
      {
        _tag: 'Say',
        text: 'Done: the store has its index and the tests pass.',
      },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'plan',
    about: 'a checklist, ticked as it goes',
    steps: [
      {
        _tag: 'Plan',
        items: [
          { step: 'Read the store', status: 'in_progress' },
          { step: 'Add the index', status: 'pending' },
          { step: 'Run the tests', status: 'pending' },
        ],
      },
      { _tag: 'Pause', ms: 600 },
      {
        _tag: 'Plan',
        items: [
          { step: 'Read the store', status: 'completed' },
          { step: 'Add the index', status: 'completed' },
          { step: 'Run the tests', status: 'in_progress' },
        ],
      },
      { _tag: 'Say', text: 'Two of three done; the tests are running.' },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'subagent',
    about: 'a subagent that starts one of its own',
    steps: [
      { _tag: 'Say', text: 'I will ask a helper to look at the tests.' },
      {
        _tag: 'Subagent',
        task: 'Check the tests',
        prompt: 'Find the failing tests in src and say why they fail.',
        steps: [
          {
            _tag: 'Search',
            pattern: 'it\\.fails',
            path: 'src',
            output: 'src/store.test.ts:40:  it.fails(...)',
          },
          {
            _tag: 'Subagent',
            task: 'Read the store test',
            prompt: 'Read src/store.test.ts and report what line 40 checks.',
            steps: [
              {
                _tag: 'Read',
                path: 'src/store.test.ts',
                text: '    40\t  it.fails("keeps order", () => {})',
              },
            ],
            report: 'Line 40 checks that rows keep their order.',
          },
        ],
        report: 'One test fails: it checks that rows keep their order.',
      },
      { _tag: 'Say', text: 'The helper found one failing test about order.' },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'question',
    about: 'asks two things and waits',
    steps: [
      { _tag: 'Say', text: 'Before I start, two choices.' },
      {
        _tag: 'Ask',
        items: [
          {
            header: 'Store',
            question: 'Where should Sessions be kept?',
            options: [
              { label: 'SQLite', description: 'One file, on this computer' },
              { label: 'Memory', description: 'Gone on restart' },
            ],
          },
          {
            header: 'Checks',
            question: 'Which checks should run?',
            options: [
              { label: 'Tests', description: 'vitest' },
              { label: 'Lint', description: 'oxlint' },
              { label: 'Types', description: 'tsc' },
            ],
            multiSelect: true,
          },
        ],
      },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'secret',
    about: 'asks for a token, hidden as typed',
    steps: [
      {
        _tag: 'Ask',
        items: [
          {
            header: 'Token',
            question: 'Paste the deploy token.',
            options: [],
            secret: true,
          },
        ],
      },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'background jobs',
    about: 'a dev server and a subagent left running',
    steps: [
      {
        _tag: 'Job',
        kind: 'shell',
        title: 'pnpm dev',
        output: [
          '\u001b[32m➜\u001b[0m  Local:   \u001b[36mhttp://localhost:5173/\u001b[0m\n',
          '\u001b[2m12:01:04\u001b[0m page reload src/app.tsx\n',
        ],
      },
      {
        _tag: 'Job',
        kind: 'agent',
        title: 'Watch the logs for errors',
        output: [],
      },
      {
        _tag: 'Say',
        text: 'The dev server runs in the background, and a helper watches its logs.',
      },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'compaction',
    about: 'compacts its context, then reports a retry',
    steps: [
      { _tag: 'Compact' },
      { _tag: 'Problem', message: 'Reconnecting… 1/5' },
      { _tag: 'Fill', usedTokens: 186_000 },
      { _tag: 'Say', text: 'The context was compacted; carrying on.' },
    ],
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'long',
    about: 'many paragraphs, slowly, for following and stopping',
    steps: Array.from({ length: 12 }, (_, index) => ({
      _tag: 'Say' as const,
      text: `Part ${index + 1}. ${WORDS}\n\n`,
    })),
    ending: DONE,
    usage: USAGE,
  },
  {
    name: 'fails',
    about: 'works a little, then the harness fails',
    steps: [
      { _tag: 'Say', text: 'Running the migration now.' },
      {
        _tag: 'Bash',
        command: 'pnpm migrate',
        output: '',
        fails: 'Error: table sessions already exists',
      },
    ],
    ending: { _tag: 'Failed', reason: 'API Error: 529 Overloaded' },
    usage: USAGE,
  },
  {
    name: 'cut off',
    about: 'the harness process exits mid-reply',
    steps: [{ _tag: 'Say', text: 'Starting on the refactor of the store.' }],
    ending: { _tag: 'CutOff' },
    usage: USAGE,
  },
];

/** The Script `name` names; the echo of `text` for `echo` or a name not in the library. */
export const scriptNamed = (name: string, text: string): Script =>
  SCRIPTS.find((script) => script.name === name) ??
  sayOnly('echo', `echo: ${text}`);
