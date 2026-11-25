import { Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import * as commands from './commands.ts';

/*
 * `ke-video`: turns a YouTube link into a short video, its transcript and a
 * summary, each Video worked on by a worker of its own in the background.
 * This file declares the commands, their arguments and flags; what each
 * does is in commands.ts, and what it prints for people in text.ts. A
 * command that cannot do what it was asked prints why on stderr and exits
 * with 1.
 */

const id = Argument.String('id').pipe(
  Argument.withDescription('The YouTube video id, as `ke-video list` shows it'),
);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Print JSON for tools instead of text'),
);

/** Ends the command with `error`'s message on stderr, and exit code 1. */
const exitWith = (error: { readonly message: string }) =>
  Effect.sync(() => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });

const ke = Command.make('ke-video').pipe(
  Command.withDescription(
    'Turns a YouTube video into a short one with silences, fillers, ads and filler talk removed, its transcript and a summary',
  ),
  Command.withSubcommands([
    Command.make(
      'create',
      {
        link: Argument.String('link').pipe(
          Argument.withDescription('A YouTube video link'),
        ),
        strength: Flag.Literals('strength', ['light', 'normal', 'heavy']).pipe(
          Flag.withDefault('normal'),
          Flag.withDescription('How much to cut; normal unless given'),
        ),
        json,
      },
      ({ link, strength, json }) =>
        commands.create(link, strength, json).pipe(Effect.catch(exitWith)),
    ).pipe(
      Command.withDescription(
        'Add a video and start its worker, after checking what it needs on this computer',
      ),
    ),
    Command.make('list', { json }, ({ json }) =>
      commands.list(json).pipe(Effect.catch(exitWith)),
    ).pipe(Command.withDescription('Every video, newest first')),
    Command.make('status', { id, json }, ({ id, json }) =>
      commands.status(id, json).pipe(Effect.catch(exitWith)),
    ).pipe(
      Command.withDescription(
        'One video: its steps, the one running, and its latest line',
      ),
    ),
    Command.make(
      'logs',
      {
        id,
        follow: Flag.Boolean('follow').pipe(
          Flag.withAlias('f'),
          Flag.withDefault(false),
          Flag.withDescription('Keep printing until its worker ends'),
        ),
        json,
      },
      ({ id, follow, json }) =>
        commands.logs(id, follow, json).pipe(Effect.catch(exitWith)),
    ).pipe(Command.withDescription("A video's log, one Event per line")),
    Command.make('stop', { id, json }, ({ id, json }) =>
      commands.stop(id, json).pipe(Effect.catch(exitWith)),
    ).pipe(
      Command.withDescription("Stop a video's worker; finished steps stay"),
    ),
    Command.make('resume', { id, json }, ({ id, json }) =>
      commands.resume(id, json).pipe(Effect.catch(exitWith)),
    ).pipe(
      Command.withDescription(
        "Start a video's worker again from the first step not done",
      ),
    ),
    Command.make('delete', { id, json }, ({ id, json }) =>
      commands.remove(id, json).pipe(Effect.catch(exitWith)),
    ).pipe(
      Command.withDescription(
        "Stop a video's worker if it runs, then remove its folder",
      ),
    ),
  ]),
);

Command.runWith(ke, { version: '0.0.0' })(process.argv.slice(2)).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
