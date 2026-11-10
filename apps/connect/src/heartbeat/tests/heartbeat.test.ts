import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { ConnectionReport, HeartbeatApi, ReportAnswer } from '../index.js';
import { versionedValuesOf } from './versioned.js';

/*
 * The Heartbeat sends every value as an ESchema, so Connect Cloud reads a
 * Connection that lags behind it, and each ESchema reads every version it
 * ever stored.
 */

const { problems, eschemas } = versionedValuesOf(HeartbeatApi);

describe('the Heartbeat', () => {
  it('sends every payload, success and item as an ESchema', () => {
    expect(problems).toEqual([]);
  });

  it.each(eschemas.map((each) => [each.name, each] as const))(
    '%s reads every version it stored',
    async (_, eschema) => {
      await expectUpgradable(eschema);
    },
  );

  it('reads a Report from a ke-connect that still sends each Plugin state', () => {
    expect(
      Schema.decodeUnknownSync(ConnectionReport.schema)({
        _v: 'v1',
        id: 'c1',
        name: 'laptop',
        key: 'k',
        version: '0.0.6',
        status: { _v: 'v1', _tag: 'Opening' },
        plugins: {},
      }),
    ).not.toHaveProperty('plugins');
  });

  it('answers a Report at a version a ke-connect before it calls newer, with only the Releases to run', () => {
    const wanted = { code: { hash: 'h', url: 'u' } };
    const sent = Schema.encodeSync(ReportAnswer.schema)({ wanted });
    expect(sent).toEqual({ _v: 'v2', wanted });
    expect(Schema.decodeUnknownSync(ReportAnswer.schema)(sent)).toEqual({
      wanted,
    });
  });

  it('names the Rpc and field of a plain struct or union', () => {
    const Note = ESchema.make('Note', { text: Schema.String }).build();
    class Lost extends Schema.TaggedError<Lost>()('Lost', {
      where: Schema.Struct({ path: Schema.String }),
    }) {}
    const plain = RpcGroup.make(
      Rpc.make('save', {
        payload: { text: Schema.String },
        success: Schema.Array(Note.schema),
        error: Lost,
      }),
      Rpc.make('watch', {
        payload: Note.schema,
        success: Schema.Union([Note.schema, Schema.Struct({})]),
        stream: true,
      }),
    );
    expect(versionedValuesOf(plain).problems).toEqual([
      'save payload is a plain Objects, not an ESchema',
      'save error Lost.where is a plain Objects, not an ESchema',
      'watch item is a plain Objects, not an ESchema',
    ]);
  });
});
