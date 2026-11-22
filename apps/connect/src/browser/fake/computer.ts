import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { FileSystemFake } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';

/*
 * One computer running `ke-connect`, faked: a keyed Child of the Computers
 * Fake, by its Connection id, owning its File System Fake as a Child of
 * its own, so each computer has its own disk and git, with their Controls.
 *
 * Its Model is what the computer is now, in a person's words: on or off,
 * how its tunnel stands, its key, how often it started, the `ke-connect`
 * it runs. serve.ts reads it into what Connect in the tab reads, a
 * `Computer`, stamping each tunnel change with the time it saw it, as the
 * Update has no clock. Every Control lands; one that changes how the
 * computer runs (a restart, an update, coming back online) also clears
 * why it last stopped.
 *
 * Three Messages are not Controls: serve.ts Sends them. `StoppedOnItsOwn`,
 * when Connect in the tab says its `ke-connect` stopped; `SocketsOpen`, as
 * the number of sockets its tunnel holds changes; `ActedElsewhere`,
 * once an act from another device, queued in `elsewhere`, came to
 * something. A Control from another device only queues the act: the Fake
 * Requires nothing, so serve.ts carries it out against the middle.
 *
 * `untilReload` holds what makes the App the older side, the Release it
 * runs: a reload, which is how an App moves to its newest build, ends it
 * (index.ts, `kept`).
 */

/** How long a computer taken offline at once has been silent: past Down, three Heartbeats of 15 s. */
export const SILENT_AT_ONCE = 60_000;

/** How its tunnel stands, as a person sees it; serve.ts adds the address and the times. */
const Tunnel = Schema.TaggedUnion({
  /** cloudflared is downloading: how much has arrived, in bytes, and for how long, in ms. */
  Downloading: { received: Schema.Finite, elapsed: Schema.Finite },
  /** cloudflared is starting and connecting to Cloudflare. */
  Opening: {},
  /** The tunnel could not open, saying why; another is tried shortly. */
  Failed: { problem: Schema.String },
  /** Up, not checked yet. */
  Unchecked: {},
  /** Up, and it reached itself there. */
  Reachable: {},
  /** Up, but it could not reach itself there, saying why. */
  Unreachable: { problem: Schema.String },
});

/** Why its `ke-connect` stopped on its own, as Connect in the tab said. */
const StoppedWhy = Schema.TaggedUnion({
  Forgotten: {},
  SignedOut: {},
  Outdated: { line: Schema.String },
  Taken: {},
});

/** What another device does to it, as the signed-in User. */
export const Act = Schema.TaggedUnion({
  /** Gives it a Display Name; blank for none. */
  Rename: { displayName: Schema.String },
  /** Has Connect Cloud forget it. */
  Forget: {},
  /** Starts a Session in the Project at a folder, with its first message. */
  StartSession: { project: Schema.String, text: Schema.String },
  /** Settles a Session. */
  SettleSession: { session: Schema.String },
  /** Answers the question a Session waits on, each part with its first choice. */
  AnswerQuestion: { session: Schema.String },
  /** Removes an agent account the user added, by its name. */
  RemoveAgentAccount: { name: Schema.String },
});
export type Act = typeof Act.Type;

const Model = Schema.Struct({
  /** Its Connection id. */
  id: Schema.String,
  /** Its Computer Name. */
  name: Schema.String,
  /** Who its `ke-connect` is signed in as. */
  email: Schema.String,
  /** The `ke-connect` version it runs. */
  version: Schema.String,
  online: Schema.Boolean,
  /** Set as it goes offline: how long Connect Cloud is to have heard nothing from it, in ms; null as it last reported. */
  silentFor: Schema.NullOr(Schema.Finite),
  /** Its `ke-connect` was removed: it asked Connect Cloud to forget it, and runs no more. */
  removed: Schema.Boolean,
  /** How many times its `ke-connect` has started. */
  starts: Schema.Int,
  /** How many times its Connection Key has changed. */
  keys: Schema.Int,
  /** How many times its tunnel has moved to a new address. */
  moves: Schema.Int,
  tunnel: Tunnel,
  /** Why its `ke-connect` last stopped on its own, until it starts again. */
  stopped: Schema.NullOr(StoppedWhy),
  /** How many sockets its tunnel holds now, as Connect in the tab counts them. */
  sockets: Schema.Int,
  /** Gone with a reload: what makes the App the older side. */
  untilReload: Schema.Struct({
    /** It runs a Release of the code Plugin other than the one Connect Cloud names. */
    runsAnotherRelease: Schema.Boolean,
  }),
  /** Acts from another device not yet carried out, each by its number. */
  elsewhere: Schema.Array(Schema.Struct({ id: Schema.Int, act: Act })),
  /** How many acts from another device it was given. */
  acts: Schema.Int,
  /** What the last act from another device came to. */
  saidElsewhere: Schema.NullOr(Schema.String),
});
export type ComputerModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** It is switched off or loses its network; with `downAtOnce`, Connect Cloud last heard from it a minute ago. */
  GoOffline: { downAtOnce: Schema.Boolean },
  /** It is on and back on its network, `ke-connect` running again. */
  ComeOnline: {},
  /** Its `ke-connect` starts again: Sessions running are cut off. */
  Restart: {},
  /** Its Connection Key changes, as it does every hour. */
  RotateKey: {},
  /** Its tunnel comes back up at a new address. */
  MoveTunnel: {},
  /** cloudflared is downloading: so many megabytes so far, for so many seconds. */
  DownloadCloudflared: { megabytes: Schema.Finite, seconds: Schema.Finite },
  /** cloudflared is opening its tunnel. */
  OpenTunnel: {},
  /** The tunnel failed to open, saying why. */
  FailTunnel: { problem: Schema.String },
  /** The tunnel is up, not checked yet. */
  TunnelUnchecked: {},
  /** The tunnel is up, and reached. */
  TunnelReachable: {},
  /** The tunnel is up, but could not be reached, saying why. */
  TunnelUnreachable: { problem: Schema.String },
  /** `ke-connect` is updated to `version` and started again. */
  UpdateKeConnect: { version: Schema.String },
  /** It runs another Release of the code Plugin than Connect Cloud names. */
  RunAnotherRelease: {},
  /** It runs the Release Connect Cloud names, as `ke-connect` does once updated. */
  RunTheNamedRelease: {},
  /** Its `ke-connect` is removed (`ke-connect remove`): it asks to be forgotten. */
  ForgetItself: {},
  /** The computer is gone, without a word to Connect Cloud. */
  Remove: {},
  /** Another device gives it a Display Name; blank for none. */
  RenameElsewhere: { displayName: Schema.String },
  /** Another device has Connect Cloud forget it. */
  ForgetElsewhere: {},
  /** Another device starts a Session in the Project at a folder (`~/code/shop`). */
  StartSessionElsewhere: { project: Schema.String, text: Schema.String },
  /** Another device settles a Session, by its id. */
  SettleSessionElsewhere: { session: Schema.String },
  /** Another device answers the question a Session waits on, by its id. */
  AnswerQuestionElsewhere: { session: Schema.String },
  /** Another device removes an agent account the user added, by its name (`Work`). */
  RemoveAgentAccountElsewhere: { name: Schema.String },

  // Sent by serve.ts.
  /** Its `ke-connect` stopped on its own. */
  StoppedOnItsOwn: { why: StoppedWhy },
  /** Its tunnel holds `open` sockets now. */
  SocketsOpen: { open: Schema.Int },
  /** An act from another device came to `said`. */
  ActedElsewhere: { id: Schema.Int, said: Schema.String },
});
export type ComputerMessage = typeof Message.Type;

/** A computer's Controls. */
export const COMPUTER_CONTROLS = [
  'GoOffline',
  'ComeOnline',
  'Restart',
  'RotateKey',
  'MoveTunnel',
  'DownloadCloudflared',
  'OpenTunnel',
  'FailTunnel',
  'TunnelUnchecked',
  'TunnelReachable',
  'TunnelUnreachable',
  'UpdateKeConnect',
  'RunAnotherRelease',
  'RunTheNamedRelease',
  'ForgetItself',
  'Remove',
  'RenameElsewhere',
  'ForgetElsewhere',
  'StartSessionElsewhere',
  'SettleSessionElsewhere',
  'AnswerQuestionElsewhere',
  'RemoveAgentAccountElsewhere',
] as const satisfies ReadonlyArray<ComputerMessage['_tag']>;

export const ComputerFake = Actor.define('Computer', {
  input: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    version: Schema.String,
  }),
  model: Model,
  message: Message,
  emits: { Removed: {} },
});

/** Queues an act from another device. */
const queued = (act: Act, model: ComputerModel) => ({
  model: {
    elsewhere: [...model.elsewhere, { id: model.acts, act }],
    acts: model.acts + 1,
  },
});

export const ComputerFakeLive = ComputerFake.build({
  init: ({ id, name, email, version }) => ({
    model: {
      id,
      name,
      email,
      version,
      online: true,
      silentFor: null,
      removed: false,
      starts: 1,
      keys: 0,
      moves: 0,
      tunnel: { _tag: 'Reachable' },
      stopped: null,
      sockets: 0,
      untilReload: { runsAnotherRelease: false },
      elsewhere: [],
      acts: 0,
      saidElsewhere: null,
    },
  }),
  children: { fileSystem: Actor.child(FileSystemFake) },
  on: {
    GoOffline: ({ downAtOnce }) => ({
      model: { online: false, silentFor: downAtOnce ? SILENT_AT_ONCE : null },
    }),
    ComeOnline: () => ({
      model: { online: true, silentFor: null, stopped: null },
    }),
    Restart: (_, { model }) => ({
      model: { starts: model.starts + 1, stopped: null },
    }),
    RotateKey: (_, { model }) => ({ model: { keys: model.keys + 1 } }),
    MoveTunnel: (_, { model }) => ({
      model: { moves: model.moves + 1, tunnel: { _tag: 'Reachable' } },
    }),
    DownloadCloudflared: ({ megabytes, seconds }) => ({
      model: {
        tunnel: {
          _tag: 'Downloading',
          received: Math.max(0, Math.round(megabytes * 1_000_000)),
          elapsed: Math.max(0, Math.round(seconds * 1000)),
        },
      },
    }),
    OpenTunnel: () => ({ model: { tunnel: { _tag: 'Opening' } } }),
    FailTunnel: ({ problem }) => ({
      model: {
        tunnel: {
          _tag: 'Failed',
          problem: problem.trim() || 'cloudflared exited',
        },
      },
    }),
    TunnelUnchecked: () => ({ model: { tunnel: { _tag: 'Unchecked' } } }),
    TunnelReachable: () => ({ model: { tunnel: { _tag: 'Reachable' } } }),
    TunnelUnreachable: ({ problem }) => ({
      model: {
        tunnel: {
          _tag: 'Unreachable',
          problem: problem.trim() || 'the tunnel did not answer',
        },
      },
    }),
    UpdateKeConnect: ({ version }, { model }) => ({
      model: {
        version: version.trim() || model.version,
        starts: model.starts + 1,
        stopped: null,
      },
    }),
    RunAnotherRelease: () => ({
      model: { untilReload: { runsAnotherRelease: true } },
    }),
    RunTheNamedRelease: () => ({
      model: { untilReload: { runsAnotherRelease: false } },
    }),
    ForgetItself: () => ({ model: { removed: true } }),
    Remove: () => ({ emit: { _tag: 'Removed' } }),
    RenameElsewhere: ({ displayName }, { model }) =>
      queued({ _tag: 'Rename', displayName }, model),
    ForgetElsewhere: (_, { model }) => queued({ _tag: 'Forget' }, model),
    StartSessionElsewhere: ({ project, text }, { model }) =>
      queued({ _tag: 'StartSession', project, text }, model),
    SettleSessionElsewhere: ({ session }, { model }) =>
      queued({ _tag: 'SettleSession', session }, model),
    AnswerQuestionElsewhere: ({ session }, { model }) =>
      queued({ _tag: 'AnswerQuestion', session }, model),
    RemoveAgentAccountElsewhere: ({ name }, { model }) =>
      queued({ _tag: 'RemoveAgentAccount', name }, model),

    StoppedOnItsOwn: ({ why }) => ({ model: { stopped: why } }),
    SocketsOpen: ({ open }) => ({ model: { sockets: open } }),
    ActedElsewhere: ({ id, said }, { model }) => ({
      model: {
        elsewhere: model.elsewhere.filter((each) => each.id !== id),
        saidElsewhere: said,
      },
    }),
  },
});
