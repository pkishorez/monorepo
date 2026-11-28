import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

export const PluginName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,62}$/),
);

export const PluginHash = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/),
);

export const Address = Bounded(256).check(
  Schema.isPattern(/^https:\/\/[^/?#\s]+$/),
);

export const Release = Schema.Struct({
  hash: PluginHash,
  url: Schema.String,
});
export type Release = typeof Release.Type;

export const EnabledPlugins = Schema.Record(Schema.String, Release);
export type EnabledPlugins = typeof EnabledPlugins.Type;

export const Report = ESchema.make('Report', {
  id: Bounded(64),
  name: Bounded(64),
  version: Schema.String.check(Schema.isMaxLength(32)),
  url: Schema.NullOr(Address),
  key: Bounded(128),
}).build();
export type Report = typeof Report.Type;

export const Answer = ESchema.make('Answer', {
  plugins: EnabledPlugins,
}).build();
export type Answer = typeof Answer.Type;

export const AuthInfo = ESchema.make('AuthInfo', {
  url: Schema.String,
}).build();
export type AuthInfo = typeof AuthInfo.Type;

export class ConnectionRemoved extends Schema.TaggedError<ConnectionRemoved>()(
  'ConnectionRemoved',
  { id: Schema.String },
) {}

export class ConnectionTaken extends Schema.TaggedError<ConnectionTaken>()(
  'ConnectionTaken',
  { id: Schema.String },
) {}
