import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { Step } from '@kestack/devtools-kabuki/api';

import { clientFlags, output, printClient } from '../client-command/index.js';
import { withKabukiSession, withKabukiSessions } from './connection.js';
import {
  renderChangesText,
  renderHistoryText,
  renderSessionsText,
  renderSnapshotText,
} from './text.js';

/*
 * `devtools kabuki`: ask a running Kabuki app about itself, through the
 * DevTools Server it is connected to as a Kabuki Session.
 *
 * 1. sessions   the live Kabuki Sessions.
 * 2. history    a Kabuki Session's History, the last few or since an entry.
 * 3. changes    what one Step did.
 * 4. snapshot   the Snapshot at a Step, or a part of it.
 */

const session = Argument.String('session').pipe(
  Argument.withDescription(
    'The Kabuki Session, by name: see `devtools kabuki sessions`',
  ),
);

const toStep = (text: string): Step => {
  if (text === 'init') return 'init';
  const id = Number(text);
  if (!Number.isInteger(id)) throw new Error(`not an entry id: ${text}`);
  return id;
};

const someOf = <K extends string, A>(key: K, value: Option.Option<A>) =>
  Option.match(value, {
    onNone: () => ({}),
    onSome: (some) => ({ [key]: some }) as { readonly [P in K]: A },
  });

// 1. sessions
const sessionsCommand = Command.make('sessions', clientFlags, (flags) =>
  printClient(
    flags,
    withKabukiSessions(flags.url, (sessions) => sessions.list()).pipe(
      Effect.map((list) => output(list, renderSessionsText)),
    ),
  ),
).pipe(
  Command.withDescription(
    'List the live Kabuki Sessions: name, app, origin, when connected, page',
  ),
);

// 2. history
const historyCommand = Command.make(
  'history',
  {
    session,
    last: Flag.optional(
      Flag.Int('last').pipe(
        Flag.withAlias('n'),
        Flag.withDescription('Only the last N entries'),
      ),
    ),
    since: Flag.optional(
      Flag.Int('since').pipe(
        Flag.withDescription('Only the entries after this entry id'),
      ),
    ),
    ...clientFlags,
  },
  ({ session, last, since, ...flags }) =>
    printClient(
      flags,
      withKabukiSession(flags.url, session, (client) =>
        client.history({ ...someOf('last', last), ...someOf('since', since) }),
      ).pipe(Effect.map((history) => output(history, renderHistoryText))),
    ),
).pipe(
  Command.withDescription(
    "A Kabuki Session's History, oldest first: each entry's id, Message, destination, source, outcome and time",
  ),
);

// 3. changes
const changesCommand = Command.make(
  'changes',
  {
    session,
    step: Argument.Int('step').pipe(
      Argument.withDescription('The entry id whose Step to read'),
    ),
    ...clientFlags,
  },
  ({ session, step, ...flags }) =>
    printClient(
      flags,
      withKabukiSession(flags.url, session, (client) =>
        client.changes({ step }),
      ).pipe(Effect.map((changes) => output(changes, renderChangesText))),
    ),
).pipe(
  Command.withDescription(
    'What one Step did: its Message, the Commands it asked for, and each Instance it added, changed or removed',
  ),
);

// 4. snapshot
const snapshotCommand = Command.make(
  'snapshot',
  {
    session,
    at: Flag.optional(
      Flag.String('at').pipe(
        Flag.withDescription(
          'The Step: an entry id, or init; the Head if absent',
        ),
        Flag.mapTryCatch(toStep, (error) => `--at: ${String(error)}`),
      ),
    ),
    path: Flag.optional(
      Flag.String('path').pipe(
        Flag.withDescription('A dot path into the Snapshot, as model.notes.0'),
      ),
    ),
    expand: Flag.Boolean('expand').pipe(
      Flag.withDescription('Show a large value whole, not folded'),
      Flag.withDefault(false),
    ),
    ...clientFlags,
  },
  ({ session, at, path, expand, ...flags }) =>
    printClient(
      flags,
      withKabukiSession(flags.url, session, (client) =>
        client.snapshot({
          ...someOf('at', at),
          ...someOf('path', path),
          ...(expand ? { expand } : {}),
        }),
      ).pipe(Effect.map((view) => output(view, renderSnapshotText))),
    ),
).pipe(
  Command.withDescription(
    "A Kabuki Session's Snapshot at a Step, or a part of it by dot path; large values folded unless --expand",
  ),
);

export const kabukiCommand = Command.make('kabuki', {}, () => Effect.void).pipe(
  Command.withDescription(
    'Ask a running Kabuki app, connected as a Kabuki Session, about its History and Snapshots',
  ),
  Command.withSubcommands([
    sessionsCommand,
    historyCommand,
    changesCommand,
    snapshotCommand,
  ]),
);
