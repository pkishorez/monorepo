import { Effect, Schema } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type {
  AskFailed,
  FolderExists,
  FolderNotFound,
  FolderUnreadable,
  HarnessFailed,
  InvalidAccount,
  InvalidBinary,
  InvalidFolderName,
  ModelsUnavailable,
  NotForkable,
  OutsideHome,
  PermissionDenied,
  ProjectNotFound,
  SessionNotFound,
  SkillsUnavailable,
  SpeechToTextNotReady,
  TranscriptionFailed,
  UnknownAccount,
} from '@kestack/connect/code';

/*
 * How every call to the server ends: in one Message, what came back or why
 * it was refused, in a sentence a person reads. Each feature makes its own
 * calls in its `api.ts`; this is what they share. A call made while the
 * socket is down waits for it to come back.
 */

/** Every way a call to the server can fail: its own errors, or the socket's. */
type Failure =
  | AskFailed
  | FolderExists
  | FolderNotFound
  | FolderUnreadable
  | HarnessFailed
  | InvalidAccount
  | InvalidBinary
  | InvalidFolderName
  | ModelsUnavailable
  | NotForkable
  | OutsideHome
  | PermissionDenied
  | ProjectNotFound
  | SessionNotFound
  | SkillsUnavailable
  | SpeechToTextNotReady
  | TranscriptionFailed
  | UnknownAccount
  | RpcClientError.RpcClientError;

/** What a refused call ends with. */
export const Refused = { reason: Schema.String };

/** Why the server refused a call, as a person reads it. */
export const reasonOf = (cause: Failure): string => {
  switch (cause._tag) {
    case 'FolderNotFound':
      return `No folder at ${cause.path}`;
    case 'FolderExists':
      return `Something is already at ${cause.path}`;
    case 'PermissionDenied':
      return `Not allowed to open ${cause.path}`;
    case 'OutsideHome':
      return `${cause.path} is outside your home folder`;
    case 'InvalidFolderName':
      return `${cause.name} cannot be a folder's name: ${cause.reason}`;
    case 'FolderUnreadable':
      return `Could not read ${cause.path}: ${cause.message}`;
    case 'ProjectNotFound':
      return 'This project no longer exists';
    case 'SessionNotFound':
      return 'This session no longer exists';
    case 'UnknownAccount':
      return 'That agent account is no longer on this Machine';
    case 'ModelsUnavailable':
      return 'Could not load the models';
    case 'NotForkable':
      return `It cannot be forked there: ${cause.reason}`;
    case 'SpeechToTextNotReady':
      return cause.state === 'Downloading'
        ? 'Speech to Text is still downloading on that Machine'
        : cause.state === 'Failed'
          ? "Speech to Text couldn't be set up on that Machine"
          : 'Speech to Text is off on that Machine';
    case 'TranscriptionFailed':
      return cause.message || "Couldn't make out the audio";
    case 'AskFailed':
    case 'InvalidAccount':
    case 'InvalidBinary':
    case 'HarnessFailed':
    case 'SkillsUnavailable':
      return cause.message || 'The server refused it';
    case 'RpcClientError':
      return cause.message || 'The server could not be reached';
  }
};

/** A call ended in `done`'s Message, or in `Refused` with the reason. */
export const orRefused = <A, M, R>(
  call: Effect.Effect<A, Failure, R>,
  done: (value: A) => M,
) =>
  call.pipe(
    Effect.map(done),
    Effect.catch((cause) =>
      Effect.succeed({ _tag: 'Refused' as const, reason: reasonOf(cause) }),
    ),
  );
