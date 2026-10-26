import { Data, Effect, Stream } from 'effect';
import {
  RpcClient,
  type Rpc,
  type RpcClientError,
  type RpcGroup,
} from 'effect/rpc';
import { findOutdatedVersion } from '@kestack/std-toolkit/eschema';
import { OnOutdated } from '@kestack/std-toolkit/replica';

/*
 * A call that failed because one side is older than the other. Every value
 * on the wire is an ESchema, so the newer side reads the older one; what is
 * left is the older side meeting something newer:
 *
 * - client  this side read an answer at a version newer than it knows: an
 *           ESchema's `OutdatedVersion`, inside the decode that failed.
 * - server  the server has no such call, or read a payload at a version
 *           newer than it knows. Effect RPC answers both as a defect, a
 *           sentence: `Unknown request tag: …`, or the decode's issue,
 *           which names `Unknown schema version: v…`.
 *
 * Effect RPC dies with either; `versionedClient` turns those deaths into a
 * `VersionGap` failure, so a caller can say which side to update. Any other
 * defect stays one. A newer answer is the same news to the app as a newer
 * Entity to its Replica, so the client being older first runs the app's
 * `OnOutdated`, such as moving to its newest build.
 */

/** A call failed because the `older` side is older than the other. */
export class VersionGap extends Data.TaggedError('VersionGap')<{
  readonly older: 'client' | 'server';
}> {
  override get message() {
    return this.older === 'server'
      ? 'The server is older: it lacks this call, or cannot read it'
      : 'This client is older than the answer it was sent';
  }
}

const fromServer = /^Unknown request tag: |Unknown schema version: v\d+/;

/** The side a defect says is older, if it says one is. */
export const olderSideOf = (defect: unknown): VersionGap | null =>
  typeof defect === 'string' && fromServer.test(defect)
    ? new VersionGap({ older: 'server' })
    : findOutdatedVersion(defect) !== undefined
      ? new VersionGap({ older: 'client' })
      : null;

const outdated = Effect.flatMap(Effect.service(OnOutdated), (tell) => tell);

const gapOrDie = (defect: unknown) => {
  const gap = olderSideOf(defect);
  return gap === null
    ? Effect.die(defect)
    : gap.older === 'client'
      ? Effect.andThen(outdated, Effect.fail(gap))
      : Effect.fail(gap);
};

/** Each call of `client`, failing with `VersionGap` where it would die of one. */
const withGaps = (client: object): object =>
  Object.fromEntries(
    Object.entries(client).map(([tag, call]) => [
      tag,
      (...args: ReadonlyArray<unknown>) => {
        const made: unknown = (
          call as (...args: ReadonlyArray<unknown>) => unknown
        )(...args);
        return Stream.isStream(made)
          ? Stream.catchDefect(made, (defect) =>
              Stream.fromEffect(gapOrDie(defect)),
            )
          : Effect.isEffect(made)
            ? Effect.catchDefect(made, gapOrDie)
            : made;
      },
    ]),
  );

/** `RpcClient.make(group)`, whose every call fails with `VersionGap` where it would die of one. */
export const versionedClient = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  Effect.map(
    RpcClient.make(group),
    (client) =>
      withGaps(client) as RpcClient.RpcClient<
        Rpcs,
        RpcClientError.RpcClientError | VersionGap
      >,
  );
