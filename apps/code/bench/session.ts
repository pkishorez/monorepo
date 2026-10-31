import type { Message, Part } from '@kestack/connect/code';

/*
 * A long session, made up the same way every time: turns of your words,
 * the agent thinking, runs of tool calls with their output, notes between
 * them, a subagent now and then, and an answer in markdown with lists,
 * inline code, a table and code blocks, streamed a few sentences at a
 * time, as Claude and Codex send them. Each Message is one record, as a
 * session's Window holds them.
 */

/** A small seeded random, so every run draws the same session. */
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const SENTENCES = [
  'The handler reads the session row before it opens the socket, so the first frame already knows the agent.',
  'I traced the stale value to the cache key, which ignored the connection id.',
  'Nothing else calls `resolveWindow`, so changing its signature is safe.',
  'The test covers the empty case but not a session with a single steered turn.',
  'Running the suite again shows the flake is gone, and the timing stays under a second.',
  'This keeps the public API the same; only the internal ordering changes.',
  'The migration is idempotent, so running it twice leaves the table as it was.',
  'I left the old branch in place behind the flag until the next release.',
  'The `useFollow` hook already handles the resize, so nothing else needs to listen.',
  'Both callers pass a sorted list, which lets the merge run in one pass.',
];

const FILES = [
  'src/server/session.ts',
  'src/server/window.ts',
  'src/client/cache.ts',
  'src/client/view.tsx',
  'src/shared/schema.ts',
  'tests/session.test.ts',
  'README.md',
  'package.json',
];

const CODE = `export const windowOf = (rows: ReadonlyArray<Row>, at: number) => {
  const start = Math.max(0, at - WINDOW);
  const end = Math.min(rows.length, at + WINDOW);
  return rows.slice(start, end).map((row) => ({
    ...row,
    seen: row.at <= at,
  }));
};

export function useWindow(rows: ReadonlyArray<Row>, at: number) {
  return useMemo(() => windowOf(rows, at), [rows, at]);
}`;

const pick = <T>(next: () => number, list: ReadonlyArray<T>): T =>
  list[Math.floor(next() * list.length)]!;

const sentences = (next: () => number, count: number) =>
  Array.from({ length: count }, () => pick(next, SENTENCES)).join(' ');

/** An answer in markdown, as an agent writes one at a turn's end. */
const answerOf = (next: () => number, turn: number) => {
  const parts = [
    `## What changed\n\n${sentences(next, 3)}`,
    Array.from(
      { length: 3 + Math.floor(next() * 4) },
      () => `- ${sentences(next, 1)}`,
    ).join('\n'),
    sentences(next, 4),
  ];
  if (turn % 2 === 0) parts.push(`\`\`\`ts\n${CODE}\n\`\`\``);
  if (turn % 5 === 0)
    parts.push(
      [
        '| File | Before | After |',
        '| --- | --- | --- |',
        ...FILES.slice(0, 4).map(
          (file) =>
            `| \`${file}\` | ${Math.floor(next() * 400)} | ${Math.floor(next() * 400)} |`,
        ),
      ].join('\n'),
    );
  if (turn % 3 === 0)
    parts.push(`\`\`\`bash\npnpm test --filter session\npnpm lint\n\`\`\``);
  parts.push(`## Next\n\n${sentences(next, 2)}`);
  return parts.join('\n\n');
};

/** Text cut into a stream's chunks: a few sentences, or a block, each. */
const chunksOf = (text: string, next: () => number) => {
  const blocks = text.split(/(?<=\n\n)/);
  const chunks: string[] = [];
  for (const block of blocks) {
    if (block.startsWith('```') || block.length < 160) {
      chunks.push(block);
      continue;
    }
    let rest = block;
    while (rest.length > 0) {
      const size = 80 + Math.floor(next() * 120);
      chunks.push(rest.slice(0, size));
      rest = rest.slice(size);
    }
  }
  return chunks;
};

const output = (next: () => number, lines: number) =>
  Array.from(
    { length: lines },
    (_, at) => `${String(at + 1).padStart(4)}  ${pick(next, SENTENCES)}`,
  ).join('\n');

export interface Shape {
  /** How many turns the session holds. */
  readonly turns: number;
  /** Whether its last turn still runs, its answer still arriving. */
  readonly running?: boolean;
  /** Each turn a question and a line of answer, shorter than a turn's guessed height. */
  readonly short?: boolean;
}

/** The Messages of one session, oldest first. */
export const sessionOf = ({ turns, running = false, short = false }: Shape) => {
  const next = random(42);
  const messages: Message[] = [];
  let id = 0;
  let at = Date.UTC(2026, 9, 1);
  const push = (
    turnId: string,
    role: Message['role'],
    parts: ReadonlyArray<Part>,
    agentId: string | null = null,
  ) => {
    at += 400 + Math.floor(next() * 2000);
    messages.push({
      id: `m${String(++id).padStart(8, '0')}`,
      sessionId: 'bench',
      turnId,
      agentId,
      role,
      parts,
      at,
    } as Message);
  };
  const stream = (
    turnId: string,
    channel: 'text' | 'reasoning',
    text: string,
    agentId: string | null = null,
  ) => {
    const streamId = `s${id}`;
    for (const chunk of chunksOf(text, next))
      push(
        turnId,
        'assistant',
        [{ type: 'textChunk', streamId, channel, text: chunk }],
        agentId,
      );
  };
  let calls = 0;
  const tool = (turnId: string, agentId: string | null = null) => {
    const callId = `call${++calls}`;
    const kind = pick(next, [
      'read',
      'read',
      'bash',
      'search',
      'edit',
    ] as const);
    const file = pick(next, FILES);
    const call: Part =
      kind === 'read'
        ? {
            type: 'toolCall',
            id: callId,
            tool: 'read',
            name: 'Read',
            title: file,
            input: { file_path: `/work/app/${file}` },
          }
        : kind === 'bash'
          ? {
              type: 'toolCall',
              id: callId,
              tool: 'bash',
              name: 'Bash',
              title: 'pnpm test',
              input: { command: 'pnpm test --filter session' },
            }
          : kind === 'search'
            ? {
                type: 'toolCall',
                id: callId,
                tool: 'search',
                name: 'Grep',
                title: 'resolveWindow',
                input: { pattern: 'resolveWindow', path: '/work/app/src' },
              }
            : {
                type: 'toolCall',
                id: callId,
                tool: 'edit',
                name: 'Edit',
                title: file,
                input: {
                  file_path: `/work/app/${file}`,
                  old_string: 'const start = at - WINDOW;',
                  new_string: 'const start = Math.max(0, at - WINDOW);',
                },
              };
    push(turnId, 'assistant', [call], agentId);
    push(
      turnId,
      'tool',
      [
        {
          type: 'toolResult',
          toolCallId: callId,
          output: output(next, 5 + Math.floor(next() * 40)),
          truncated: false,
          isError: next() < 0.05,
        },
      ],
      agentId,
    );
  };
  let total = 0;
  for (let turn = 1; turn <= turns; turn++) {
    const turnId = `t${turn}`;
    const last = turn === turns;
    push(turnId, 'user', [
      {
        type: 'turnStarted',
        text: sentences(next, 1 + Math.floor(next() * 3)),
        steered: false,
      },
    ]);
    stream(turnId, 'reasoning', sentences(next, 3));
    const runs = short ? 0 : 2 + Math.floor(next() * 3);
    for (let run = 0; run < runs; run++) {
      const steps = 3 + Math.floor(next() * 6);
      for (let step = 0; step < steps; step++) tool(turnId);
      if (turn % 4 === 0 && run === 0) {
        // A subagent: its call, its own steps under its id, its report.
        const callId = `call${++calls}`;
        push(turnId, 'assistant', [
          {
            type: 'toolCall',
            id: callId,
            tool: 'subagent',
            name: 'Agent',
            title: 'Find every caller',
            input: { prompt: 'Find every caller of resolveWindow.' },
          },
        ]);
        for (let step = 0; step < 4; step++) tool(turnId, callId);
        stream(turnId, 'text', sentences(next, 2), callId);
        push(turnId, 'tool', [
          {
            type: 'toolResult',
            toolCallId: callId,
            output: sentences(next, 2),
            truncated: false,
            isError: false,
          },
        ]);
      }
      if (run < runs - 1)
        stream(turnId, 'text', sentences(next, 1 + Math.floor(next() * 2)));
    }
    if (last && running) {
      stream(turnId, 'text', answerOf(next, turn).slice(0, 400));
      break;
    }
    stream(turnId, 'text', short ? sentences(next, 1) : answerOf(next, turn));
    total += 0.05 + next() * 0.3;
    push(turnId, 'assistant', [
      {
        type: 'turnEnded',
        status: 'done',
        usage: {
          inputTokens: 20_000 + Math.floor(next() * 50_000),
          outputTokens: 1_000 + Math.floor(next() * 4_000),
          cacheReadTokens: 100_000,
          costUsd: total,
        },
      },
    ]);
  }
  return { messages, nextId: () => `m${String(++id).padStart(8, '0')}` };
};

/** One more chunk of the answer still arriving, as the next Message. */
export const chunkOf = (
  messages: ReadonlyArray<Message>,
  id: string,
  at: number,
): Message => {
  const last = [...messages]
    .reverse()
    .find((message) =>
      message.parts.some(
        (part) => part.type === 'textChunk' && part.channel === 'text',
      ),
    )!;
  const part = last.parts[0] as Extract<Part, { type: 'textChunk' }>;
  return {
    ...last,
    id,
    at,
    parts: [{ ...part, text: ` ${SENTENCES[at % SENTENCES.length]}` }],
  };
};
