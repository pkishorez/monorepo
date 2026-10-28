import { readFileSync } from 'node:fs';
import { Effect, Fiber, Layer, SubscriptionRef } from 'effect';
import type { Connection } from '@kestack/connect/cloud';
import { ConnectionAddress } from '@kestack/connect/code';
import { Replicas } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import {
  ConnectionsChannel,
  connectionsLayer as connections,
  nobody,
} from '../../../../connections.ts';
import { addressAt, byConnection } from '../reach.ts';
import { PLUGIN_CODE } from '../release.ts';

/*
 * A Connection's Instance is held by that Connection's own Replicas, and opens
 * nothing until the Connection runs here: an address naming a Connection not
 * running, such as another Account's, waits. Its socket dials the code
 * Plugin at the Release this Code was built with.
 */

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** A Connection's Replicas, saying each Key it was asked to hold. */
const replicasOf = (connectionId: string, held: Array<string>) =>
  Replicas.of({
    hold: (_, key) =>
      Effect.sync(() => {
        held.push(`${connectionId}:${key}`);
        return null as never;
      }),
  });

describe('the Replicas of every Connection', () => {
  it('hold each Instance in its own Connection’s Replicas, once it runs', async () => {
    const held: Array<string> = [];
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const link = yield* ConnectionsChannel;
          const replicas = yield* Replicas;
          yield* SubscriptionRef.set(link.replicas, {
            mine: replicasOf('mine', held),
          });
          yield* replicas.hold('Ai', 'mine');
          expect(held).toEqual(['mine:mine']);
          // Not running here, as another Account's: it waits.
          const opening = yield* Effect.forkScoped(
            replicas.hold('Ai', 'theirs'),
          );
          yield* wait();
          expect(held).toEqual(['mine:mine']);
          // Runs (as once its Account is signed in): it opens, in its own.
          yield* SubscriptionRef.update(link.replicas, (now) => ({
            ...now,
            theirs: replicasOf('theirs', held),
          }));
          yield* Fiber.join(opening);
          expect(held).toEqual(['mine:mine', 'theirs:theirs']);
        }).pipe(
          Effect.provide(byConnection.pipe(Layer.provideMerge(connections))),
        ),
      ),
    );
  });
});

describe('the socket of every Connection', () => {
  const listed = (url: string): typeof Connection.Type => ({
    id: 'm1',
    name: 'm1',
    key: 'key-m1',
    version: '0.0.5',
    status: { _tag: 'Reachable', url, at: 0 },
    lastSeen: 0,
    plugins: {},
    wanted: {},
    minConnect: null,
  });

  it('is built with the latest Release in the code Plugin’s Release Log', () => {
    const log = JSON.parse(
      readFileSync(
        new URL(
          '../../../../../../../../node_modules/@kestack/connect/src/plugins/code/releases.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { readonly releases: ReadonlyArray<{ readonly hash: string }> };
    expect(PLUGIN_CODE).toMatch(/^[a-f0-9]{64}$/);
    expect(PLUGIN_CODE).toBe(log.releases.at(-1)?.hash);
  });

  it('dials the code Plugin at that Release, with its Connection Key', async () => {
    const address = await Effect.runPromise(
      Effect.gen(function* () {
        const { known } = yield* ConnectionsChannel;
        yield* SubscriptionRef.set(known, {
          ...nobody,
          accountId: 'a1',
          connections: [listed('https://m1.trycloudflare.com/')],
        });
        return yield* (yield* ConnectionAddress).of('m1');
      }).pipe(
        Effect.provide(
          addressAt(PLUGIN_CODE).pipe(Layer.provideMerge(connections)),
        ),
      ),
    );
    expect(address).toEqual({
      url: `wss://m1.trycloudflare.com/code/${PLUGIN_CODE}/rpc`,
      key: 'key-m1',
    });
  });
});
