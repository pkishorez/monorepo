import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';

/*
 * What Cloud Connect answers, shared by Cloud Connect, `ke-connect serve`
 * and every App. Every call is the signed-in caller's own: nothing
 * names a User. A Machine reports itself on every Heartbeat; an App lists
 * the caller's Machines and forgets one. A Machine forgotten stays
 * forgotten: its Sign-in may never report it again (ADR 0016).
 *
 * Besides the RPC, Cloud Connect answers `GET /auth` with how a Machine signs
 * in, so `serve` needs Cloud Connect's address alone. Both servers, Cloud
 * Connect and a Machine's, let in the same origin patterns.
 */

export { allowsOrigin } from './origins.js';

/** The RPC's path on Cloud Connect. */
export const RPC_PATH = '/rpc';

/** The path that answers how a Machine signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Machine signs in to reach Cloud Connect: through the Auth Worker at `url`. */
export const AuthInfo = Schema.Struct({ url: Schema.String });
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
  /** The version of Connect it runs. */
  version: Schema.String.check(Schema.isMaxLength(32)),
  status: MachineStatus,
});
export type MachineReport = typeof MachineReport.Type;

/** A Machine as its User sees it: what it last reported, and its Last Seen. */
export const Machine = Schema.Struct({
  ...MachineReport.fields,
  /** Its Last Seen: when it last reported, epoch ms, by Cloud Connect's clock. */
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
export const CloudApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
