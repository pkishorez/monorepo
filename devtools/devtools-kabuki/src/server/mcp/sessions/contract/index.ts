import { Schema } from 'effect';
import { Tool, Toolkit } from 'effect/ai';
import {
  ControlRefused,
  InstanceNotFound,
  MessageRefused,
  Previewing,
  StepNotFound,
} from '../../../rpc/session/contract/index.ts';
import { KabukiSessionNotFound } from '../../../rpc/sessions/contract/index.ts';

const At = Schema.Union([Schema.Finite, Schema.Literal('start')]);

const Text = Schema.String;

export const SessionsTools = Toolkit.make(
  Tool.make('kabuki_sessions', {
    description:
      'The Kabuki apps connected, by the name every kabuki_* tool takes as session. Then kabuki_look, kabuki_timeline, kabuki_step; kabuki_send acts.',
    success: Text,
  }).annotate(Tool.Readonly, true),
  Tool.make('kabuki_look', {
    description:
      'The Instances, one line each under its parent: name [State] and a short Model. At the head, problems first: failed or waiting work, Commands running. open: names to show whole, with the Messages each takes. at: a past step.',
    parameters: Schema.Struct({
      session: Schema.String,
      at: Schema.optionalKey(At),
      open: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
    success: Text,
    failure: Schema.Union([
      KabukiSessionNotFound,
      StepNotFound,
      InstanceNotFound,
    ]),
  }).annotate(Tool.Readonly, true),
  Tool.make('kabuki_timeline', {
    description:
      'Chains, newest first, one line each: id, sender, Tag → Instance, Emits, what changed; repeats that changed nothing folded. Filter by instance, tag or only; before: an id, for older.',
    parameters: Schema.Struct({
      session: Schema.String,
      instance: Schema.optionalKey(Schema.String),
      tag: Schema.optionalKey(Schema.String),
      only: Schema.optionalKey(Schema.Literals(['changed', 'unhandled'])),
      before: Schema.optionalKey(Schema.Finite),
    }),
    success: Text,
    failure: Schema.Union([KabukiSessionNotFound, InstanceNotFound]),
  }).annotate(Tool.Readonly, true),
  Tool.make('kabuki_step', {
    description:
      'One Chain whole, by any id in it: each Message, its payload, sender and outcome, and what it changed, before → after.',
    parameters: Schema.Struct({ session: Schema.String, id: Schema.Finite }),
    success: Text,
    failure: Schema.Union([KabukiSessionNotFound, StepNotFound]),
  }).annotate(Tool.Readonly, true),
  Tool.make('kabuki_send', {
    description:
      'Sends { "_tag": a Message kabuki_look lists, ...its fields } to an Instance; once the app settles, answers the Chain it began, the Chains after and new failures.',
    parameters: Schema.Struct({
      session: Schema.String,
      to: Schema.String,
      message: Schema.Unknown,
    }),
    success: Text,
    failure: Schema.Union([
      KabukiSessionNotFound,
      InstanceNotFound,
      MessageRefused,
      Previewing,
    ]),
  }),
  Tool.make('kabuki_travel', {
    description:
      'Shows the app as it was at a step, keeping its timeline, and answers the look there; null comes back to now.',
    parameters: Schema.Struct({
      session: Schema.String,
      to: Schema.NullOr(At),
    }),
    success: Text,
    failure: Schema.Union([KabukiSessionNotFound, StepNotFound]),
  }),
  Tool.make('kabuki_fork', {
    description:
      'Drops every Message after a step; the app carries on from there. Answers the look once it settles.',
    parameters: Schema.Struct({ session: Schema.String, from: At }),
    success: Text,
    failure: Schema.Union([KabukiSessionNotFound, StepNotFound]),
  }),
  Tool.make('kabuki_fakes', {
    description:
      'In fake mode, the Fakes standing in for the outside world, or the one named: each its state and Controls.',
    parameters: Schema.Struct({
      session: Schema.String,
      fake: Schema.optionalKey(Schema.String),
    }),
    success: Text,
    failure: KabukiSessionNotFound,
  }).annotate(Tool.Readonly, true),
  Tool.make('kabuki_control', {
    description:
      "Runs a Fake's Control with a payload as kabuki_fakes shows it; answers as kabuki_send does.",
    parameters: Schema.Struct({
      session: Schema.String,
      fake: Schema.String,
      control: Schema.String,
      payload: Schema.Unknown,
    }),
    success: Text,
    failure: Schema.Union([KabukiSessionNotFound, ControlRefused]),
  }),
);
