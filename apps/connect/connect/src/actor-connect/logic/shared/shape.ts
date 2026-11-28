import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { EnabledPlugins, Release } from '@kestack/connect-cloud/heartbeat';
import { Cloud } from '../../../services/cloud/contract/index.js';
import { Control } from '../../../services/control/contract/index.js';
import { SignIn } from '../../../services/sign-in/contract/index.js';
import { Store } from '../../../services/store/contract/index.js';

export { Release };

export const Connection = Schema.Struct({
  name: Schema.String,
  computerName: Schema.String,
  cloud: Schema.String,
  version: Schema.String,
});

export const TunnelSettings = Schema.Struct({
  port: Schema.Finite,
  origins: Schema.Array(Schema.String),
  reachEvery: Schema.Finite,
  rotateKeyEvery: Schema.Finite,
});

export const PluginHome = Schema.Struct({
  data: Schema.String,
  state: Schema.String,
  cache: Schema.String,
  sockets: Schema.Struct({ prefix: Schema.String, suffix: Schema.String }),
});

export const Settings = Schema.Struct({
  heartbeatEvery: Schema.Finite,
  firstRetryAfter: Schema.Finite,
  tunnel: TunnelSettings,
  pluginHome: PluginHome,
});
export type Settings = typeof Settings.Type;

export const Input = Schema.Struct({
  connection: Connection,
  settings: Settings,
});
export type Input = typeof Input.Type;

export const Who = Schema.Struct({
  user: Schema.Struct({ id: Schema.String, email: Schema.String }),
  connection: Schema.Struct({ id: Schema.String, name: Schema.String }),
});
export type Who = typeof Who.Type;

export const Address = Schema.Struct({
  url: Schema.NullOr(Schema.String),
  key: Schema.String,
});
export type Address = typeof Address.Type;

export const Why = Schema.TaggedUnion({
  Requested: {},
  Removed: {},
  Outdated: { line: Schema.String },
  Failed: { reason: Schema.String },
});
export type Why = typeof Why.Type;

export const ConnectShape = Actor.define('Connect', {
  description:
    'One Connection on this computer: signed in, reachable through its Tunnel, running the Plugins Connect Cloud enables for it',
  requires: [SignIn, Store, Cloud, Control],
  input: Input,
  model: {
    ...Input.fields,
    address: Schema.NullOr(Address),
    plugins: EnabledPlugins,
    signIn: Schema.Struct({
      at: Schema.NullOr(Schema.Finite),
      refusals: Schema.Finite,
    }),
  },
  state: {
    SigningIn: { who: Schema.NullOr(Who) },
    SignedIn: { who: Who },
    Stopped: { why: Why },
  },
  message: {
    SignedIn: { who: Who },
    SignInFailed: { reason: Schema.String },
    SignedOut: {},
    ConnectionRemoved: {},
    CliOutdated: { line: Schema.String },
    EnabledPluginsChanged: { plugins: EnabledPlugins },
    TunnelAddressChanged: Address,
    TunnelFailed: { reason: Schema.String },
    StopRequested: {},
  },
});
