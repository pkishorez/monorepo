import { createHash } from 'node:crypto';
import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import type { EnabledPlugins } from '@kestack/connect-cloud/heartbeat';
import { Cloud, type ReportAnswer } from '../contract/index.js';

const Plugin = Schema.Struct({
  name: Schema.String,
  release: Schema.Finite,
  enabled: Schema.Boolean,
});

export const CloudState = Schema.Struct({
  online: Schema.Boolean,
  expiring: Schema.Boolean,
  removed: Schema.Boolean,
  outdated: Schema.Boolean,
  plugins: Schema.Array(Plugin),
  reports: Schema.Finite,
  last: Schema.NullOr(
    Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      url: Schema.NullOr(Schema.String),
      answer: Schema.String,
    }),
  ),
});
export type CloudState = typeof CloudState.Type;

export const hashOf = (name: string, release: number) =>
  createHash('sha256').update(`${name}@${release}`).digest('hex');

const enabledOf = (state: CloudState): EnabledPlugins =>
  Object.fromEntries(
    state.plugins
      .filter(({ enabled }) => enabled)
      .map(({ name, release }) => {
        const hash = hashOf(name, release);
        return [
          name,
          { hash, url: `https://releases.fake/${name}/${hash}.mjs` },
        ];
      }),
  );

const answerOf = (state: CloudState): ReportAnswer => {
  if (!state.online)
    return { _tag: 'Unsent', problem: 'Connect Cloud could not be reached' };
  if (state.outdated)
    return {
      _tag: 'Outdated',
      line: 'This ke-connect is too old for Connect Cloud; update it with npm i -g @kestack/connect',
    };
  if (state.removed) return { _tag: 'Removed' };
  if (state.expiring) return { _tag: 'SignedOut' };
  return { _tag: 'Enabled', plugins: enabledOf(state) };
};

const NAME = Schema.Struct({ name: Schema.String });

const withPlugin =
  (
    name: string,
    change: (
      plugin: typeof Plugin.Type | undefined,
    ) => typeof Plugin.Type | null,
  ) =>
  (state: SubscriptionRef.SubscriptionRef<CloudState>) =>
    SubscriptionRef.update(state, (now) => {
      const found = now.plugins.find((each) => each.name === name);
      const next = change(found);
      const others = now.plugins.filter((each) => each.name !== name);
      return { ...now, plugins: next === null ? others : [...others, next] };
    });

const known = (
  state: SubscriptionRef.SubscriptionRef<CloudState>,
  name: string,
) =>
  Effect.flatMap(SubscriptionRef.get(state), (now) =>
    now.plugins.some((each) => each.name === name)
      ? Effect.void
      : Effect.fail(`Connect Cloud has no Plugin ${name}`),
  );

const set =
  (change: Partial<CloudState>) =>
  (_: unknown, state: SubscriptionRef.SubscriptionRef<CloudState>) =>
    SubscriptionRef.update(state, (now) => ({ ...now, ...change }));

export const cloud = Fake.make({
  name: 'cloud',
  state: CloudState,
  initial: {
    online: true,
    expiring: false,
    removed: false,
    outdated: false,
    plugins: [
      { name: 'echo', release: 1, enabled: true },
      { name: 'notes', release: 1, enabled: false },
    ],
    reports: 0,
    last: null,
  },
  controls: {
    EnablePlugin: Fake.control(CloudState, NAME, ({ name }, state) =>
      withPlugin(name.trim(), (found) => ({
        name: name.trim(),
        release: found?.release ?? 1,
        enabled: true,
      }))(state),
    ),
    DisablePlugin: Fake.control(CloudState, NAME, ({ name }, state) =>
      Effect.andThen(
        known(state, name),
        withPlugin(name, (found) => ({ ...found!, enabled: false }))(state),
      ),
    ),
    PublishRelease: Fake.control(CloudState, NAME, ({ name }, state) =>
      Effect.andThen(
        known(state, name),
        withPlugin(name, (found) => ({
          ...found!,
          release: found!.release + 1,
        }))(state),
      ),
    ),
    GoOffline: Fake.control(
      CloudState,
      Schema.Struct({}),
      set({ online: false }),
    ),
    ComeOnline: Fake.control(
      CloudState,
      Schema.Struct({}),
      set({ online: true }),
    ),
    ExpireSignIn: Fake.control(
      CloudState,
      Schema.Struct({}),
      set({ expiring: true }),
    ),
    RemoveConnection: Fake.control(
      CloudState,
      Schema.Struct({}),
      set({ removed: true }),
    ),
    RequireNewerConnect: Fake.control(
      CloudState,
      Schema.Struct({}),
      set({ outdated: true }),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Cloud,
      Cloud.of({
        report: (report) =>
          SubscriptionRef.modify(state, (now) => {
            const answer = answerOf(now);
            return [
              answer,
              {
                ...now,
                expiring: answer._tag === 'SignedOut' ? false : now.expiring,
                reports: now.reports + 1,
                last: {
                  name: report.name,
                  version: report.version,
                  url: report.url,
                  answer: answer._tag,
                },
              },
            ];
          }),
        remove: () =>
          SubscriptionRef.update(state, (now) => ({ ...now, removed: true })),
      }),
    ),
});
