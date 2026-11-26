import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, layer } from '@effect/vitest';
import { Effect, Layer, Stream } from 'effect';
import { Claude, type ClaudeOptions } from '../claude/contract/index.js';
import * as ClaudeReal from '../claude/real/index.js';
import { Codex } from '../codex/contract/index.js';
import * as CodexReal from '../codex/real/index.js';

const e2e = process.env['AI_TOOLKIT_V2_E2E'] === '1';
const cwd = e2e
  ? realpathSync(mkdtempSync(join(tmpdir(), 'ai-toolkit-v2-handoff-')))
  : '';
const claudeOptions: ClaudeOptions = {
  model: 'haiku',
  settingSources: [],
  strictMcpConfig: true,
};
const summarySchema = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
};

const lastEnded = <A extends { readonly _tag: string }>(
  outs: ReadonlyArray<A>,
): Extract<A, { readonly _tag: 'Ended' }> => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended') throw new Error('No Ended last');
  return last as Extract<A, { readonly _tag: 'Ended' }>;
};

const firstId = (outs: ReadonlyArray<{ readonly _tag: string }>): string => {
  const first = outs[0];
  if (first?._tag !== 'Started' || !('id' in first))
    throw new Error('No Started first');
  return String(first.id);
};

afterAll(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe.runIf(e2e)('a Claude session handed over to Codex', () => {
  layer(
    Layer.mergeAll(
      ClaudeReal.layer({ linger: '1 second' }),
      CodexReal.layer({ linger: '1 second' }),
    ),
    { excludeTestServices: true, timeout: 240_000 },
  )((it) => {
    it.effect(
      'summarizes a fork of Claude as data, and Codex carries on from it',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const codex = yield* Codex;

          const first = yield* Stream.runCollect(
            claude.create({
              cwd,
              prompt:
                'Remember this: the release codename is BLUE-HERON-42. Reply with just OK.',
              options: claudeOptions,
            }),
          );
          const claudeId = firstId(first);
          expect(lastEnded(first).status).toBe('completed');

          const summarized = yield* Stream.runCollect(
            claude.fork({
              id: claudeId,
              cwd,
              prompt:
                'Summarize this conversation for another agent in one sentence, keeping every name and code exactly.',
              options: {
                ...claudeOptions,
                persistSession: false,
                outputFormat: { type: 'json_schema', schema: summarySchema },
              },
            }),
          );
          const result = lastEnded(summarized).result;
          const structured =
            result && 'structured_output' in result
              ? result.structured_output
              : undefined;
          const summary = (structured as { summary?: string } | undefined)
            ?.summary;
          expect(summary).toContain('BLUE-HERON-42');

          const models = yield* codex.models({});
          const model =
            models.data.find((m) => /luna|mini|nano/i.test(m.id))?.id ??
            models.data[0]?.id ??
            '';
          const handed = yield* Stream.runCollect(
            codex.create({
              thread: { cwd, approvalPolicy: 'never', sandbox: 'read-only' },
              turn: {
                model,
                effort: 'low',
                input: [
                  {
                    type: 'text',
                    text: `Context from a previous agent: ${summary}\n\nWhat is the release codename? Reply with only the codename.`,
                    text_elements: [],
                  },
                ],
              },
            }),
          );
          const ended = lastEnded(handed);
          expect(firstId(handed)).not.toBe('');
          expect(ended.status).toBe('completed');
          expect(ended.result).toContain('BLUE-HERON-42');
        }),
      240_000,
    );
  });
});
