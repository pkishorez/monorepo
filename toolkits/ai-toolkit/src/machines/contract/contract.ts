import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz } from '@kestack/auth-toolkit';

/*
 * What the Machines Backend answers, shared by the Backend, `ai-toolkit
 * serve` and the app. Every call is the signed-in caller's own: nothing
 * names a User. A Machine reports itself on every Heartbeat; the app lists
 * the caller's Machines and forgets one. A Machine forgotten stays
 * forgotten: its Sign-in may never report it again (ADR 0016).
 *
 * Besides the RPC, the Backend answers `GET /auth` with how a Machine signs
 * in, so `serve` needs the Backend's address alone.
 */

/** The RPC's path on the Backend. */
export const RPC_PATH = '/rpc';

/** The path that answers how a Machine signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Machine signs in to reach the Backend: the Auth Worker's, or Local mode. */
export const AuthInfo = Schema.Union([
  Schema.Struct({ url: Schema.String }),
  Schema.Struct({ local: Schema.Literal(true) }),
]);
export type AuthInfo = typeof AuthInfo.Type;

/** Whether a Machine could reach itself at its public address, as its last Heartbeat found. */
export const TunnelCheck = Schema.Struct({
  ok: Schema.Boolean,
  /** When it was checked, epoch ms. */
  at: Schema.Number,
  /** Why it failed, when it did. */
  problem: Schema.NullOr(Schema.String),
});
export type TunnelCheck = typeof TunnelCheck.Type;

/** What a Machine says of itself on each Heartbeat. */
export const MachineReport = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  /** Its public address, `https://…`; null while it has none. */
  url: Schema.NullOr(Schema.String),
  /** Its Machine Key (ADR 0015). */
  key: Schema.NonEmptyString,
  /** The ai-toolkit version it runs. */
  version: Schema.String,
  tunnel: Schema.NullOr(TunnelCheck),
});
export type MachineReport = typeof MachineReport.Type;

/** A Machine as its User sees it: what it last reported, and its Last Seen. */
export const Machine = Schema.Struct({
  ...MachineReport.fields,
  /** Its Last Seen: when it last reported, epoch ms, by the Backend's clock. */
  lastSeen: Schema.Number,
});
export type Machine = typeof Machine.Type;

/** The Machine was forgotten by its User; it must sign out and stop. */
export class MachineForgotten extends Schema.TaggedError<MachineForgotten>()(
  'MachineForgotten',
  { id: Schema.String },
) {}

/** A Machine id taken by another User. */
export class MachineTaken extends Schema.TaggedError<MachineTaken>()(
  'MachineTaken',
  { id: Schema.String },
) {}

export const MachinesApi = Authz.required(
  RpcGroup.make(
    Rpc.make('Report', {
      payload: MachineReport,
      success: Machine,
      error: Schema.Union([MachineForgotten, MachineTaken]),
    }),
    Rpc.make('List', {
      payload: Schema.Struct({}),
      success: Schema.Array(Machine),
    }),
    Rpc.make('Forget', {
      payload: Schema.Struct({ id: Schema.NonEmptyString }),
      success: Schema.Void,
    }),
  ),
);
