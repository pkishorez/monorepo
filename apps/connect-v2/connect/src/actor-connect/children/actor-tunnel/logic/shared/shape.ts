import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Cloudflared } from '../../../../../services/cloudflared/contract/index.js';
import { Server } from '../../../../../services/server/contract/index.js';

export const PluginRoute = Schema.Struct({
  hash: Schema.String,
  socket: Schema.String,
});

const Input = Schema.Struct({
  port: Schema.Finite,
  origins: Schema.Array(Schema.String),
  reachEvery: Schema.Finite,
  rotateKeyEvery: Schema.Finite,
});

export const TunnelShape = Actor.define('Tunnel', {
  description:
    "The Connection's address: its local port, its Key, and the Cloudflare tunnel that reaches the port from outside",
  requires: [Server, Cloudflared],
  input: Input,
  props: { routes: Schema.Record(Schema.String, PluginRoute) },
  model: {
    settings: Input,
    listening: Schema.NullOr(Schema.Finite),
    key: Schema.String,
    opening: Schema.Finite,
    unreachable: Schema.Finite,
  },
  state: {
    SettingUp: {},
    Active: { url: Schema.String, reachable: Schema.NullOr(Schema.Boolean) },
  },
  message: {
    PortOpened: { port: Schema.Finite, key: Schema.String },
    PortFailed: { reason: Schema.String },
    TunnelUp: { url: Schema.String },
    TunnelDown: {},
    TunnelReachable: {},
    TunnelUnreachable: {},
    KeyRotated: { key: Schema.String },
  },
  emits: {
    TunnelAddressChanged: {
      url: Schema.NullOr(Schema.String),
      key: Schema.String,
    },
    TunnelFailed: { reason: Schema.String },
  },
});
