import { Schema } from 'effect';
import { Tool, Toolkit } from 'effect/ai';
import {
  ControlRefused,
  InstanceNotFound,
  MessageRefused,
  Seeking,
  StepNotFound,
} from '../../../rpc/session/contract/index.ts';
import { KabukiSessionNotFound } from '../../../rpc/sessions/contract/index.ts';

const At = Schema.Union([Schema.Finite, Schema.Literal('start')]);

const Result = Schema.Record(Schema.String, Schema.Unknown);

export const SessionsTools = Toolkit.make(
  Tool.make('kabuki_sessions', {
    description:
      'The Kabuki apps running now, by name: pass one as session to every kabuki_* tool. Start with kabuki_look; in fake mode, kabuki_fakes sets up the outside world.',
    success: Result,
  }),
  Tool.make('kabuki_look', {
    description:
      "The app's instances, one per line, indented under its parent: its name, then its State. Each name in open also gives its Model and the Messages a person sends it. at: a past step.",
    parameters: Schema.Struct({
      session: Schema.String,
      at: Schema.optionalKey(At),
      open: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    success: Result,
    failure: Schema.Union([
      KabukiSessionNotFound,
      StepNotFound,
      InstanceNotFound,
    ]),
  }),
  Tool.make('kabuki_timeline', {
    description:
      'Where the app is now, and its last 10 Messages, or the 10 before the id given as before; an id is a step.',
    parameters: Schema.Struct({
      session: Schema.String,
      before: Schema.optionalKey(Schema.Finite),
    }),
    success: Result,
    failure: KabukiSessionNotFound,
  }),
  Tool.make('kabuki_send', {
    description:
      'Sends { "_tag": a Message kabuki_look lists, ...its fields } to the instance named. Once the app settles, answers how it was taken, the Model fields it changed, and the instances that came (+), went (-) or changed State.',
    parameters: Schema.Struct({
      session: Schema.String,
      to: Schema.String,
      message: Schema.Unknown,
    }),
    success: Result,
    failure: Schema.Union([
      KabukiSessionNotFound,
      InstanceNotFound,
      MessageRefused,
      Seeking,
    ]),
  }),
  Tool.make('kabuki_travel', {
    description:
      'Shows the app as it was at a step, keeping its timeline; null comes back to now. Sending waits until it is back.',
    parameters: Schema.Struct({
      session: Schema.String,
      to: Schema.NullOr(At),
    }),
    success: Result,
    failure: Schema.Union([KabukiSessionNotFound, StepNotFound]),
  }),
  Tool.make('kabuki_fork', {
    description:
      'Drops every Message after a step; the app carries on from there.',
    parameters: Schema.Struct({ session: Schema.String, from: At }),
    success: Result,
    failure: Schema.Union([KabukiSessionNotFound, StepNotFound]),
  }),
  Tool.make('kabuki_fakes', {
    description:
      'In fake mode, the Fakes standing in for the outside world, or only the one named: each its state and its Controls.',
    parameters: Schema.Struct({
      session: Schema.String,
      fake: Schema.optionalKey(Schema.String),
    }),
    success: Result,
    failure: KabukiSessionNotFound,
  }),
  Tool.make('kabuki_control', {
    description:
      "Runs a Fake's Control with a payload as kabuki_fakes shows it; answers what changed, as kabuki_send does.",
    parameters: Schema.Struct({
      session: Schema.String,
      fake: Schema.String,
      control: Schema.String,
      payload: Schema.Unknown,
    }),
    success: Result,
    failure: Schema.Union([KabukiSessionNotFound, ControlRefused]),
  }),
);
