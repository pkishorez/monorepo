import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';
import { RpcSchema, type Rpc } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import * as Plugin from '@kestack/cli-platform/plugins/contract';
import * as Link from '../../link/index.js';
import * as Heartbeat from '../index.js';

/*
 * What an older `ke-connect` reads or serves changes only with a raised
 * Minimum Connect (ADR 0011). frozen.json keeps the Minimum Connect and, for
 * each such value, its ESchema version and its shape, or, for a plain one,
 * what it is. A shape is a hash of the value's JSON Schema, so a field
 * changed inside a version moves it too. A value that moved or went fails
 * this until the Minimum Connect is raised: a change cannot name the version
 * it ships in, so it sets `"raiseMinConnect": true` in package.json, beside a
 * changeset for `@kestack/connect`, and the release raises `minConnect` to
 * that version (scripts/raise-min-connect.ts). Then `UPDATE_FROZEN=1 pnpm
 * test` rewrites frozen.json, so it always matches. A value new here fails
 * until `UPDATE_FROZEN=1` adds it, which needs no raise.
 * Each is held to frozen.json as it is, as last committed, and as main has
 * it, so neither taking an entry out of the file nor editing it by hand in the
 * same change lets it move. What `ke-connect` only sends, a Report and its
 * Connection Status, is not here: Connect Cloud reads it at any older version,
 * which report/tests/older.test.ts checks.
 *
 * Every export of the Heartbeat, the Link and the Plugin contract is either
 * kept here or named in UNFROZEN with why an older `ke-connect` does not
 * need it kept, so nothing joins them unguarded.
 *
 * It sits beside the Heartbeat, though it reads the Link and the Plugin
 * contract too: tests are outside the Laymos Rules.
 */

const {
  AUTH_PATH,
  AuthInfo,
  belowMinimum,
  ConnectionForgotten,
  ConnectionTaken,
  HEARTBEAT_PATH,
  HeartbeatApi,
  RELEASE_PATH,
  releaseKey,
  ReportAnswer,
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} = Heartbeat;
const {
  DEFAULT_ORIGINS,
  HEALTH,
  KEY_EXPIRED,
  KEY_PREFIX,
  PLUGIN_MISMATCH,
  PluginMismatch,
  pluginPath,
  PROTOCOL,
} = Link;
const { PluginControl, PluginEnv, PluginPaths, PluginStatus, READY } = Plugin;

const FROZEN = new URL('./frozen.json', import.meta.url);
const PACKAGE = new URL('../../../../package.json', import.meta.url);
const CHANGESETS = new URL('../../../../../../.changeset/', import.meta.url);

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
  // The Link, which `ke-connect` serves an App at, and the pages it lets in.
  DEFAULT_ORIGINS: JSON.stringify(DEFAULT_ORIGINS),
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

/** Why an older `ke-connect` needs none of these kept, each an export of the Heartbeat, the Link or the Plugin contract not in `values`. */
const UNFROZEN: Readonly<Record<string, string>> = {
  // The Heartbeat.
  addressOf: 'a function over a ConnectionStatus, which ke-connect only sends',
  belowMinimum:
    'a function Connect Cloud runs; ke-connect only sends its version',
  outdatedLine:
    'a function Connect Cloud runs; ke-connect only prints the line, as UPGRADE_REQUIRED keeps',
  CheckResult: 'ke-connect only sends it, in a Report: older.test.ts reads it',
  ConnectionReport:
    'ke-connect only sends it, as a Report: older.test.ts reads it',
  ConnectionStatus:
    'ke-connect only sends it, in a Report: older.test.ts reads it',
  SetupStep: 'ke-connect only sends it, in a Report: older.test.ts reads it',
  TunnelCheck: 'ke-connect only sends it, in a Report: older.test.ts reads it',
  Release: 'read only inside ReportAnswer, whose shape is kept',
  // The Link.
  allowsOrigin:
    'a function over the origins ke-connect is given, DEFAULT_ORIGINS among them',
  keyProtocols: 'a function: what it makes is PROTOCOL and KEY_PREFIX, kept',
  pluginOfPath: 'a function: the path it reads is pluginPath, kept',
  mismatchReason: 'a function: what it writes is PluginMismatch, kept',
  mismatchOf:
    'a function an App runs on a close: PLUGIN_MISMATCH and PluginMismatch, kept',
  keyExpired: 'a function an App runs on a close: KEY_EXPIRED, kept',
  // The Plugin contract.
  PluginState:
    'ke-connect only sends it, in a v1 Report: older.test.ts reads it',
};

/** Each export of the contracts neither kept in `values` nor named in UNFROZEN, and each name in UNFROZEN that is no export or is kept. */
const unguarded = (() => {
  const exported = new Set([
    ...Object.keys(Heartbeat),
    ...Object.keys(Link),
    ...Object.keys(Plugin),
  ]);
  return [
    ...[...exported]
      .filter((name) => !(name in values) && !(name in UNFROZEN))
      .map(
        (name) =>
          `${name} is exported by a contract an older ke-connect reads, but is neither kept in values nor named in UNFROZEN with why.`,
      ),
    ...Object.keys(UNFROZEN)
      .filter((name) => !exported.has(name) || name in values)
      .map((name) =>
        exported.has(name)
          ? `${name} is kept in values, so UNFROZEN need not name it.`
          : `${name} is named in UNFROZEN but no contract exports it.`,
      ),
  ];
})();

const { minConnect, raiseMinConnect } = JSON.parse(
  readFileSync(PACKAGE, 'utf8'),
) as { readonly minConnect: string; readonly raiseMinConnect?: unknown };

/** Whether the next release raises the Minimum Connect to itself. */
const raising = raiseMinConnect === true;

/** Whether a changeset waiting for the next release names `@kestack/connect`. */
const connectReleases = () =>
  readdirSync(CHANGESETS)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .some((name) => {
      const head = /^---\n([^]*?)\n---/.exec(
        readFileSync(new URL(name, CHANGESETS), 'utf8'),
      )?.[1];
      return /^['"]?@kestack\/connect['"]?\s*:/m.test(head ?? '');
    });

/** Why the raise cannot happen as set, if it cannot. */
const raise =
  raiseMinConnect !== undefined && !raising
    ? [
        `"raiseMinConnect" in apps/connect/package.json must be true, or absent.`,
      ]
    : raising && !connectReleases()
      ? [
          `"raiseMinConnect" waits for a release that never comes: add a changeset for @kestack/connect.`,
        ]
      : [];

const now: Frozen = { minConnect, values };

const UPDATING = process.env['UPDATE_FROZEN'] === '1';

const UPDATE = 'update frozen.json (UPDATE_FROZEN=1 pnpm test)';

/** A frozen.json as read, `values` empty when it has none. */
const read = (text: string): Frozen => {
  const { minConnect: was, values: kept } = JSON.parse(text) as Partial<Frozen>;
  return { minConnect: was ?? '0.0.0', values: kept ?? {} };
};

const kept = read(readFileSync(FROZEN, 'utf8'));

/** What git answers, trimmed; null when it fails or there is no git. */
const git = (...args: ReadonlyArray<string>): string | null => {
  try {
    return execFileSync('git', args, {
      cwd: fileURLToPath(new URL('.', FROZEN)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

/**
 * The commit on main this change starts from: where a branch leaves main;
 * else, on main or on CI's merge of a pull request, which fetches no main,
 * the first parent.
 */
const mainBase = (() => {
  const head = git('rev-parse', 'HEAD');
  for (const main of ['origin/main', 'main']) {
    const base = git('merge-base', 'HEAD', main);
    if (base !== null && base !== head) return base;
  }
  return git('rev-parse', 'HEAD^1');
})();

/** frozen.json at the commit `rev`, when git has it there. */
const frozenAt = (rev: string | null): Frozen | null => {
  if (rev === null) return null;
  const text = git('show', `${rev}:./frozen.json`);
  return text === null ? null : read(text);
};

/**
 * frozen.json as last committed and as main has it, when git has them: an
 * entry taken out and written back by `UPDATE_FROZEN=1` as if it were new, or
 * edited by hand and committed, is still held to what it was.
 */
const earlier = [
  { where: 'the last commit', frozen: frozenAt('HEAD') },
  { where: 'main', frozen: frozenAt(mainBase) },
].flatMap(({ where, frozen }) => (frozen === null ? [] : [{ where, frozen }]));

/** What went wrong against `was`, a frozen.json kept before. */
const against = (was: Frozen, where: string) => {
  if (belowMinimum(minConnect, was.minConnect))
    return [
      `"minConnect" went down, from ${was.minConnect} in ${where} to ${minConnect}: it only ever rises.`,
    ];
  if (raising || belowMinimum(was.minConnect, minConnect)) return [];
  return Object.entries(was.values).flatMap(([name, value]) =>
    values[name] === value
      ? []
      : [
          `${name} ${name in values ? `moved ${value}→${values[name]}` : 'went'} since ${where}; an older ke-connect cannot read it. Set "raiseMinConnect": true in apps/connect/package.json, so the next release raises the Minimum Connect to itself, then ${UPDATE}.`,
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
      ...earlier.flatMap(({ where, frozen }) => against(frozen, where)),
      ...added,
      ...raise,
    ]).toEqual([]);
    if (UPDATING) writeFileSync(FROZEN, `${JSON.stringify(now, null, 2)}\n`);
    else expect(now, `frozen.json is behind: ${UPDATE}.`).toEqual(kept);
  });

  it('keeps every export of the contracts, or says why it need not', () => {
    expect(unguarded).toEqual([]);
  });
});
