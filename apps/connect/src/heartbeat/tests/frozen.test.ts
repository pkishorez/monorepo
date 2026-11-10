import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';
import { RpcSchema, type Rpc } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import {
  PluginControl,
  PluginEnv,
  PluginPaths,
  PluginStatus,
  READY,
} from '@kestack/cli-platform/plugins/contract';
import { RELEASE_PATH, releaseKey } from '../../cloud/worker/store/index.js';
import { HEALTH } from '../../connection/cli/actor-identity/actor-connection/server/guard.js';
import {
  KEY_EXPIRED,
  KEY_PREFIX,
  PLUGIN_MISMATCH,
  PluginMismatch,
  pluginPath,
  PROTOCOL,
} from '../../connection/link/index.js';
import {
  AUTH_PATH,
  AuthInfo,
  belowMinimum,
  ConnectionForgotten,
  ConnectionTaken,
  HEARTBEAT_PATH,
  HeartbeatApi,
  ReportAnswer,
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} from '../index.js';

/*
 * What an older `ke-connect` reads or serves changes only with a raised
 * Minimum Connect (ADR 0011). frozen.json keeps the Minimum Connect and, for
 * each such value, its ESchema version and its shape, or, for a plain one,
 * what it is. A shape is a hash of the value's JSON Schema, so a field
 * changed inside a version moves it too. A value that moved or went fails
 * this until `minConnect` in package.json is raised above the one kept; then
 * `UPDATE_FROZEN=1 pnpm test` rewrites frozen.json, so it always matches. A
 * value new here fails until `UPDATE_FROZEN=1` adds it, which needs no raise.
 * Each is held to frozen.json as it is and as last committed, so taking an
 * entry out of the file does not let it change. What `ke-connect` only
 * sends, a Report and its Connection Status, is not here: Connect Cloud reads
 * it at any older version, which report/tests/older.test.ts checks.
 *
 * It sits beside the Heartbeat, though it reads the Link and the Plugin
 * contract too: tests are outside the Laymos Rules.
 */

const FROZEN = new URL('./frozen.json', import.meta.url);
const PACKAGE = new URL('../../../package.json', import.meta.url);

interface Frozen {
  readonly minConnect: string;
  readonly values: Readonly<Record<string, string | number>>;
}

/** `value` as JSON, its keys sorted, and any list of names too, so order alone never moves it. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.every((each) => typeof each === 'string')
      ? [...value].sort()
      : value.map(canonical)
    : typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, each]) => [key, canonical(each)]),
        )
      : value;

/** A short hash of `value`, as canonical JSON. */
const hashOf = (value: unknown) =>
  `#${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
    .slice(0, 12)}`;

/** What a schema reads, as a hash of its JSON Schema. */
const shapeOf = (schema: Schema.Top) =>
  hashOf(Schema.toJsonSchemaDocument(schema));

/** An ESchema's version, and its shape at that version. */
const eschemaOf = (eschema: {
  readonly latestVersion: string;
  readonly schema: Schema.Top;
}) => `${eschema.latestVersion} ${shapeOf(eschema.schema)}`;

/** An RPC group's calls, and the shape of what each answers, as its caller reads it. */
const answersOf = (group: {
  readonly requests: ReadonlyMap<string, Rpc.AnyWithProps>;
}) => {
  const answers = [...group.requests.values()].map((rpc) => {
    const { success, error } = RpcSchema.isStreamSchema(rpc.successSchema)
      ? rpc.successSchema
      : { success: rpc.successSchema, error: rpc.errorSchema };
    return [rpc._tag, `${shapeOf(success)} ${shapeOf(error)}`] as const;
  });
  return `${answers
    .map(([tag]) => tag)
    .sort()
    .join(',')} ${hashOf(Object.fromEntries(answers))}`;
};

/** Every value an older `ke-connect` reads or serves, as it is now. */
const values: Frozen['values'] = {
  // The Heartbeat, as Connect Cloud answers it.
  HEARTBEAT_PATH,
  HeartbeatApi: answersOf(HeartbeatApi),
  ReportAnswer: eschemaOf(ReportAnswer),
  ConnectionForgotten: shapeOf(ConnectionForgotten),
  ConnectionTaken: shapeOf(ConnectionTaken),
  AUTH_PATH,
  AuthInfo: eschemaOf(AuthInfo),
  // Where an older `ke-connect` downloads a Release File the answer names.
  RELEASE_PATH,
  releaseKey: releaseKey('x', 'y'),
  // The 426 a `ke-connect` too old is answered with.
  VERSION_HEADER,
  UPGRADE_REQUIRED,
  // The Link, which `ke-connect` serves an App at.
  pluginPath: pluginPath('x', 'y'),
  PROTOCOL,
  KEY_PREFIX,
  HEALTH,
  PLUGIN_MISMATCH,
  PluginMismatch: eschemaOf(PluginMismatch),
  KEY_EXPIRED,
  // How `ke-connect` runs a Plugin, and what it reads of it.
  PluginEnv: JSON.stringify(PluginEnv),
  PluginPaths: JSON.stringify(PluginPaths),
  READY: JSON.stringify(READY),
  PluginControl: answersOf(PluginControl),
  PluginStatus: eschemaOf(PluginStatus),
};

const minConnect = (
  JSON.parse(readFileSync(PACKAGE, 'utf8')) as { readonly minConnect: string }
).minConnect;

const now: Frozen = { minConnect, values };

const UPDATING = process.env['UPDATE_FROZEN'] === '1';

const UPDATE = 'update frozen.json (UPDATE_FROZEN=1 pnpm test)';

/** A frozen.json as read, `values` empty when it has none. */
const read = (text: string): Frozen => {
  const { minConnect: was, values: kept } = JSON.parse(text) as Partial<Frozen>;
  return { minConnect: was ?? '0.0.0', values: kept ?? {} };
};

const kept = read(readFileSync(FROZEN, 'utf8'));

/**
 * frozen.json as last committed, when git has it: an entry taken out of
 * frozen.json and then written back by `UPDATE_FROZEN=1` as if it were new
 * is still held to what it was.
 */
const committed = (() => {
  try {
    return read(
      execFileSync('git', ['show', 'HEAD:./frozen.json'], {
        cwd: fileURLToPath(new URL('.', FROZEN)),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return null;
  }
})();

/** What went wrong against `was`, a frozen.json kept before. */
const against = (was: Frozen, where: string) => {
  if (belowMinimum(minConnect, was.minConnect))
    return [
      `"minConnect" went down, from ${was.minConnect} in ${where} to ${minConnect}: it only ever rises.`,
    ];
  if (belowMinimum(was.minConnect, minConnect)) return [];
  return Object.entries(was.values).flatMap(([name, value]) =>
    values[name] === value
      ? []
      : [
          `${name} ${name in values ? `moved ${value}→${values[name]}` : 'went'} since ${where}; an older ke-connect cannot read it. Raise "minConnect" in apps/connect/package.json, then ${UPDATE}.`,
        ],
  );
};

/** Each value frozen.json does not keep yet: only `UPDATE_FROZEN=1` adds it. */
const added = UPDATING
  ? []
  : Object.keys(values)
      .filter((name) => !(name in kept.values))
      .map((name) => `${name} is not in frozen.json: ${UPDATE}.`);

describe('what an older ke-connect reads or serves', () => {
  it('changes only with a raised Minimum Connect, and frozen.json keeps it', () => {
    expect([
      ...against(kept, 'frozen.json'),
      ...(committed === null ? [] : against(committed, 'the last commit')),
      ...added,
    ]).toEqual([]);
    if (UPDATING) writeFileSync(FROZEN, `${JSON.stringify(now, null, 2)}\n`);
    else expect(now, `frozen.json is behind: ${UPDATE}.`).toEqual(kept);
  });
});
