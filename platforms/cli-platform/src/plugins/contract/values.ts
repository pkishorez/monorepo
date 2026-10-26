import { Schema } from 'effect';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';

/*
 * The values a CLI and its Plugins pass, as ESchemas: each is written with
 * its version, so a newer side reads what an older one wrote.
 */

/** What a running Plugin says about itself. */
export const PluginStatus = ESchema.make('PluginStatus', {
  /** The Plugin's name. */
  name: Schema.String,
  /** Its process id. */
  pid: Schema.Int,
  /** When it started listening, epoch ms. */
  startedAt: Schema.Finite,
}).build();
export type PluginStatus = typeof PluginStatus.Type;

/**
 * Where a Plugin stands, as its CLI reports it. `hash` is the sha256 of the
 * Plugin's file, or the file itself in development.
 */
export const PluginState = ValueESchema.make(
  'PluginState',
  Schema.Union([
    /** Its file is downloading: bytes received, of the total when known. */
    Schema.Struct({
      _tag: Schema.Literal('Downloading'),
      hash: Schema.String,
      received: Schema.Finite,
      total: Schema.NullOr(Schema.Finite),
    }),
    /** Its process started, and is not listening yet. */
    Schema.Struct({ _tag: Schema.Literal('Starting'), hash: Schema.String }),
    /** It listens on its socket. */
    Schema.Struct({ _tag: Schema.Literal('Running'), hash: Schema.String }),
    /** Its process exited or its file could not be had: its last lines, and when it is tried again, epoch ms. */
    Schema.Struct({
      _tag: Schema.Literal('Crashed'),
      hash: Schema.String,
      log: Schema.Array(Schema.String),
      retryAt: Schema.Finite,
    }),
  ]),
).build();
export type PluginState = typeof PluginState.Type;
