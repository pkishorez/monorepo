import { describe, expect, it } from 'vitest';
import type { Part } from '@kestack/connect/code';
import type { Row } from './thread.ts';
import {
  diffsOf,
  diffText,
  grouped,
  groupTitle,
  parseUnified,
  reasonOf,
  relative,
  summary,
} from './tools.ts';

type Call = Extract<Part, { readonly type: 'toolCall' }>;

const call = (
  tool: Call['tool'],
  name: string,
  input: Call['input'],
  title = '',
): Call => ({ type: 'toolCall', id: name, tool, name, title, input });

const folder = '/tmp/demo';

describe('tools', () => {
  it('reads paths inside the folder relative to it, /private/tmp too', () => {
    expect(relative('/private/tmp/demo/src/a.ts', folder)).toBe('src/a.ts');
    expect(relative('/tmp/demo', folder)).toBe('.');
    expect(relative('/etc/hosts', folder)).toBe('/etc/hosts');
  });

  it('names a call by its verb and target, in the tense of its state', () => {
    const read = call('read', 'Read', { file_path: '/tmp/demo/math.ts' });
    expect(summary(read, 'done', folder)).toMatchObject({
      verb: 'Read',
      target: 'math.ts',
    });
    const ran = call('bash', 'commandExecution', {
      command: "/bin/zsh -lc 'pnpm test'",
    });
    expect(summary(ran, 'running', folder)).toMatchObject({
      verb: 'Running',
      target: 'pnpm test',
      code: true,
    });
    const grep = call('search', 'Grep', {
      pattern: 'SameSite',
      path: '/tmp/demo/src',
    });
    expect(summary(grep, 'done', folder)).toMatchObject({
      verb: 'Searched',
      target: 'SameSite in src',
    });
  });

  it("counts a Claude edit's lines and draws it as a diff", () => {
    const edit = call('edit', 'Edit', {
      file_path: '/private/tmp/demo/math.ts',
      old_string: 'a\nb\nc',
      new_string: 'a\nB\nc\nd',
    });
    expect(summary(edit, 'done', folder)).toMatchObject({
      verb: 'Edited',
      target: 'math.ts',
      lines: { added: 2, removed: 1 },
    });
    expect(
      diffsOf(edit, folder)[0]?.hunks[0]?.lines.map((line) => line.kind),
    ).toEqual(['context', 'removed', 'added', 'context', 'added']);
  });

  it("reads a Codex file change's unified diff", () => {
    const change = call('edit', 'fileChange', {
      changes: [
        {
          path: '/tmp/demo/math.ts',
          kind: { type: 'update' },
          diff: '@@ -11 +11,3 @@\n }\n+\n+x\n',
        },
      ],
    });
    const [diff] = diffsOf(change, folder);
    expect(diff?.path).toBe('math.ts');
    expect(diff?.hunks[0]).toMatchObject({ oldStart: 11, newStart: 11 });
    expect(diff?.hunks[0]?.lines).toEqual([
      { kind: 'context', content: '}', oldNumber: 11, newNumber: 11 },
      { kind: 'added', content: '', newNumber: 12 },
      { kind: 'added', content: 'x', newNumber: 13 },
    ]);
    expect(parseUnified('no hunks')).toEqual([]);
    expect(diffText('', 'x')).toEqual([
      { kind: 'added', content: 'x', newNumber: 1 },
    ]);
  });

  it('folds two or more calls of one kind in a row into a group', () => {
    const tool = (id: string, kind: Call['tool']): Row => ({
      kind: 'tool',
      id,
      call: call(kind, id, {}),
      result: null,
      state: 'done',
    });
    const items = grouped([
      tool('a', 'read'),
      tool('b', 'read'),
      tool('c', 'read'),
      tool('d', 'bash'),
      { kind: 'note', id: 'n', label: 'x' },
      tool('e', 'bash'),
      tool('f', 'bash'),
    ]);
    expect(
      items.map((item) =>
        item.kind === 'group' ? item.rows.length : item.row.id,
      ),
    ).toEqual([3, 'd', 'n', 2]);
    const first = items[0];
    expect(first?.kind === 'group' && groupTitle(first.rows)).toBe(
      'Read 3 files',
    );
  });

  it("gives a failed call's reason in one line", () => {
    expect(
      reasonOf('\n<tool_use_error>Error: No such tool</tool_use_error>\nmore'),
    ).toBe('Error: No such tool');
  });
});
