import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { ESchema } from '@kestack/std-toolkit/eschema';
import {
  belowMinimum,
  ConnectionForgotten,
  ConnectionReport,
  ConnectionTaken,
  ReportAnswer,
} from './report/index.js';

export {
  addressOf,
  belowMinimum,
  CheckResult,
  ConnectionForgotten,
  ConnectionReport,
  ConnectionStatus,
  ConnectionTaken,
  Release,
  ReportAnswer,
  SetupStep,
  TunnelCheck,
} from './report/index.js';
export { AUTH_PATH, AuthInfo } from './sign-in/index.js';

/*
 * The Heartbeat: everything `ke-connect` and Connect Cloud say to each other,
 * and so the one API that must stay compatible (ADR 0011): `ke-connect` is the
 * one part a person updates, so the one that can be older than the rest.
 *
 * A Connection signs in as Connect Cloud's `GET /auth` says (sign-in/), then
 * reports itself on every Heartbeat and is answered with the Release of each
 * Plugin to run (report/). When it is removed, it asks Connect Cloud to forget
 * it. Both calls are the signed-in caller's own, so nothing names a User. They
 * are served at `HEARTBEAT_PATH`, which only `ke-connect` calls: no browser.
 *
 * Every call carries the caller's version in `VERSION_HEADER`. Connect Cloud
 * reads it before anything else: below the Minimum Connect, or missing while
 * there is one, the call is answered `UPGRADE_REQUIRED` with one line of plain
 * text, `outdatedLine`, before any RPC is read or any Sign-in checked. That
 * answer, the status and a `text/plain` line, never changes: every
 * `ke-connect` from this one on reads it, whatever the RPC framing becomes.
 * What else an older `ke-connect` reads changes only with a raised Minimum
 * Connect (tests/frozen.test.ts).
 */

/** Where Connect Cloud serves the Heartbeat. */
export const HEARTBEAT_PATH = '/heartbeat';

/** The header every Heartbeat call carries: the caller's `ke-connect` version. Frozen. */
export const VERSION_HEADER = 'ke-connect-version';

/** The status of a call from a `ke-connect` below the Minimum Connect, its body one `text/plain` line to show. Frozen. */
export const UPGRADE_REQUIRED = 426;

/**
 * Why a call from `ke-connect` at `version` (null when it named none) is
 * refused under `minConnect`, as the one line Connect Cloud answers with; null
 * when it is not, as always when there is no Minimum Connect.
 */
export const outdatedLine = (
  version: string | null,
  minConnect: string | null,
): string | null =>
  minConnect === null ||
  (version !== null && !belowMinimum(version, minConnect))
    ? null
    : `${version === null ? 'This ke-connect' : `ke-connect ${version}`} is older than Connect Cloud accepts (${minConnect}): run \`npm i -g @kestack/connect@latest\`, then start it again.`;

/** What `Forget` takes: the Connection to forget. */
const ForgetPayload = ESchema.make('ForgetPayload', {
  id: Schema.NonEmptyString,
}).build();

const Rpcs = RpcGroup.make(
  Rpc.make('Report', {
    payload: ConnectionReport.schema,
    success: ReportAnswer.schema,
    error: Schema.Union([ConnectionForgotten, ConnectionTaken]),
  }),
  Rpc.make('Forget', {
    payload: ForgetPayload.schema,
    success: Schema.Void,
  }),
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const HeartbeatApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
