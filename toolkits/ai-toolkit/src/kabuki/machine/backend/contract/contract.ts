import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';

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

/** Whether a Machine could reach itself at its public address: a Tunnel Check. */
export const TunnelCheck = Schema.Struct({
  ok: Schema.Boolean,
  /** When it was checked, epoch ms. */
  at: Schema.Finite,
  /** Why it failed, when it did. */
  problem: Schema.NullOr(Schema.String),
});
export type TunnelCheck = typeof TunnelCheck.Type;

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/** A Machine's public address, `https://…` alone. */
const Address = Bounded(256).check(Schema.isPattern(/^https:\/\/[^/?#\s]+/));

/**
 * Where a Machine's tunnel stands, as its last Heartbeat said: on its way
 * (Installing, then Opening), failed to open and about to try again, or up
 * at an address, with what its last Tunnel Check found there.
 */
export const MachineStatus = Schema.TaggedUnion({
  /** Downloading cloudflared, once per computer. */
  Installing: {},
  /** cloudflared is starting and connecting to Cloudflare. */
  Opening: {},
  /** The tunnel could not open; another is tried shortly. */
  OpenFailed: { at: Schema.Finite, problem: Schema.String },
  /** Up at `url`, not checked yet. */
  Unchecked: { url: Address },
  /** Up at `url`, and the last Tunnel Check reached it. */
  Reachable: { url: Address, at: Schema.Finite },
  /** Up at `url`, but the last Tunnel Check did not reach it. */
  Unreachable: { url: Address, at: Schema.Finite, problem: Schema.String },
});
export type MachineStatus = typeof MachineStatus.Type;

/** The address a status is up at; null while there is none. */
export const addressOf = (status: MachineStatus) =>
  'url' in status ? status.url : null;

/**
 * What a Machine says of itself on each Heartbeat. Every field is bounded,
 * and its address is `https://` alone: the app dials it with the Machine
 * Key, which must never cross in clear.
 */
export const MachineReport = Schema.Struct({
  id: Bounded(64),
  name: Bounded(64),
  /** Its Machine Key (ADR 0015). */
  key: Bounded(128),
  /** The ai-toolkit version it runs. */
  version: Schema.String.check(Schema.isMaxLength(32)),
  status: MachineStatus,
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

const Rpcs = RpcGroup.make(
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
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const MachinesApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
