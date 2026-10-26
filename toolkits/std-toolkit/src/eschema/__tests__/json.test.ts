import { describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import {
  EntityESchema,
  ESchema,
  findOutdatedVersion,
  ValueESchema,
} from '../index.js';

// What RPC and HTTP do with a payload: its canonical JSON codec.
const Task = EntityESchema.make('Task', 'id', {
  title: Schema.String,
  done: Schema.Boolean,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { done: null }, ({ id, title, priority }) => ({
    id,
    title,
    priority,
  }))
  .build();

const json = Schema.toCodecJson(Task.schema);

describe('ESchema over JSON', () => {
  it('keeps the version on the wire', () => {
    const wire = Schema.encodeUnknownSync(json)({
      id: 't1',
      title: 'Write',
      priority: 'high',
    });
    expect(wire).toEqual({
      id: 't1',
      title: 'Write',
      priority: 'high',
      _v: 'v3',
    });
  });

  it('reads the latest version as sent, not as v1', () => {
    expect(
      Schema.decodeUnknownSync(json)({
        id: 't1',
        title: 'Write',
        priority: 'high',
        _v: 'v3',
      }),
    ).toEqual({ id: 't1', title: 'Write', priority: 'high' });
  });

  it('migrates an older version, as a newer reader of an older writer', () => {
    expect(
      Schema.decodeUnknownSync(json)({
        id: 't1',
        title: 'Write',
        done: true,
        _v: 'v1',
      }),
    ).toEqual({ id: 't1', title: 'Write', priority: 'low' });
  });

  it('fails a newer version with OutdatedVersion', () => {
    const read = Schema.decodeUnknownExit(json)({
      id: 't1',
      title: 'Write',
      _v: 'v4',
    });
    expect(findOutdatedVersion(read)?.version).toBe('v4');
  });

  it('round-trips a nested ESchema inside a struct', () => {
    const Note = ESchema.make('Note', { text: Schema.String })
      .evolve('v2', { pinned: Schema.Boolean }, (v1) => ({
        ...v1,
        pinned: false,
      }))
      .build();
    const payload = Schema.toCodecJson(Schema.Struct({ note: Note.schema }));
    const wire = Schema.encodeUnknownSync(payload)({
      note: { text: 'hi', pinned: true },
    });
    expect(wire).toEqual({ note: { text: 'hi', pinned: true, _v: 'v2' } });
    expect(Schema.decodeUnknownSync(payload)(wire)).toEqual({
      note: { text: 'hi', pinned: true },
    });
  });

  it('reads a value with no version as v1', () => {
    expect(
      Schema.decodeUnknownSync(json)({ id: 't1', title: 'Write', done: false }),
    ).toEqual({
      id: 't1',
      title: 'Write',
      priority: 'low',
    });
  });

  it('round-trips a value ESchema in its envelope', () => {
    const Status = ValueESchema.make('Status', Schema.String)
      .evolve('v2', Schema.Literals(['open', 'shut']), (text) =>
        text === 'shut' ? 'shut' : 'open',
      )
      .build();
    const codec = Schema.toCodecJson(Status.schema);
    const wire = Schema.encodeUnknownSync(codec)('shut');
    expect(wire).toEqual({ _v: 'v2', _value: 'shut' });
    expect(Schema.decodeUnknownSync(codec)(wire)).toBe('shut');
    expect(
      Schema.decodeUnknownSync(codec)({ _v: 'v1', _value: 'anything' }),
    ).toBe('open');
    expect(Schema.decodeUnknownSync(codec)('shut')).toBe('shut');
  });
});
