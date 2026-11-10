import { Schema } from 'effect';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { ConnectionStatus } from './status/index.js';

export {
  addressOf,
  CheckResult,
  ConnectionStatus,
  SetupStep,
  TunnelCheck,
} from './status/index.js';

/*
 * A Report, what a Connection says of itself on every Heartbeat, with its
 * Connection Status (status/), and its answer: the latest Release of each
 * Plugin, which Connect Cloud alone decides (ADR 0006). A Report is refused
 * when its Connection was forgotten, which stays forgotten (ADR 0004), or when
 * another User holds its id. A Connection below the Minimum Connect is not
 * answered at all (ADR 0011, see heartbeat.ts); `belowMinimum` says which is.
 */

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/** A version of Connect, as a Report names it. */
const Version = Schema.String.check(Schema.isMaxLength(32));

/** One Release of a Plugin: its file's sha256, and where to read that file. */
export const Release = Schema.Struct({
  hash: Schema.String,
  url: Schema.String,
});
export type Release = typeof Release.Type;

/** The latest Release of each Plugin, by name, which every Connection should run. */
const Wanted = Schema.Record(Schema.String, Release);

/** The Minimum Connect, as v1 still carried it. */
const MinConnect = Schema.NullOr(Version);

/** Where each Plugin stood, in what a Connection reported at v1. It stays on the computer now. */
const PluginStates = Schema.Record(Schema.String, PluginState.schema);

/** What a Connection says of itself. */
const reportFields = {
  id: Bounded(64),
  name: Bounded(64),
  /** Its Connection Key now (ADR 0009). */
  key: Bounded(128),
  /** The version of Connect it runs. */
  version: Version,
  status: ConnectionStatus.schema,
};

/**
 * What a Connection says of itself on each Heartbeat. Every field is bounded,
 * and its address is `https://` alone: the app dials it with the Connection
 * Key, which must never cross in clear. v2 dropped each Plugin's state.
 */
export const ConnectionReport = ESchema.make('ConnectionReport', {
  ...reportFields,
  plugins: PluginStates,
})
  .evolve('v2', { plugins: null }, ({ plugins: _, ...v1 }) => v1)
  .build();
export type ConnectionReport = typeof ConnectionReport.Type;

/**
 * The answer to a Report. v1 was the Connection as Connect Cloud kept it; v2
 * is only which Release of each Plugin to run. A `ke-connect` from before v2
 * cannot read it, which it takes as a Report not sent: it must be installed
 * again.
 */
export const ReportAnswer = ESchema.make('ReportAnswer', {
  ...reportFields,
  plugins: PluginStates,
  /** Its Last Seen: when it last reported, epoch ms, by Connect Cloud's clock. */
  lastSeen: Schema.Finite,
  wanted: Wanted,
  minConnect: MinConnect,
})
  .evolve(
    'v2',
    {
      id: null,
      name: null,
      key: null,
      version: null,
      status: null,
      plugins: null,
      lastSeen: null,
      minConnect: null,
    },
    ({ wanted }) => ({ wanted }),
  )
  .build();
export type ReportAnswer = typeof ReportAnswer.Type;

/** The Connection was forgotten by its User; it must sign out and stop. */
export class ConnectionForgotten extends Schema.TaggedError<ConnectionForgotten>()(
  'ConnectionForgotten',
  { id: Schema.String },
) {}

/** A Connection id taken by another User. */
export class ConnectionTaken extends Schema.TaggedError<ConnectionTaken>()(
  'ConnectionTaken',
  { id: Schema.String },
) {}

/** A version's numbers, and whether it is a pre-release. */
const partsOf = (version: string) => {
  const [core = '', pre] = version.trim().replace(/^v/, '').split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre !== undefined,
  };
};

/** Whether `version` is older than `than`, as semver orders them. */
const olderThan = (version: string, than: string) => {
  const a = partsOf(version);
  const b = partsOf(than);
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i++) {
    const x = a.numbers[i] ?? 0;
    const y = b.numbers[i] ?? 0;
    if (x !== y) return x < y;
  }
  return a.pre && !b.pre;
};

/** Whether a Connection at `version` is Outdated under `minConnect`; never when no minimum is known. */
export const belowMinimum = (version: string, minConnect: string | null) =>
  minConnect !== null && olderThan(version, minConnect);
