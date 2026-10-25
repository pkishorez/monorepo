import { Schema } from 'effect';

/* Every error a command can fail with, by the thing that went wrong. */

/** No folder is at the path. */
export class FolderNotFound extends Schema.TaggedError<FolderNotFound>()(
  'FolderNotFound',
  { path: Schema.String },
) {}

/** This user may not read or write the folder. */
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()(
  'PermissionDenied',
  { path: Schema.String },
) {}

/** A file or folder is already at the path. */
export class FolderExists extends Schema.TaggedError<FolderExists>()(
  'FolderExists',
  { path: Schema.String },
) {}

/** The name cannot be one new folder. */
export class InvalidFolderName extends Schema.TaggedError<InvalidFolderName>()(
  'InvalidFolderName',
  { name: Schema.String, reason: Schema.String },
) {}

/** The path, its symlinks resolved, is not inside the home folder. */
export class OutsideHome extends Schema.TaggedError<OutsideHome>()(
  'OutsideHome',
  { path: Schema.String },
) {}

/** The folder could not be listed: an I/O error, or it took too long. */
export class FolderUnreadable extends Schema.TaggedError<FolderUnreadable>()(
  'FolderUnreadable',
  { path: Schema.String, message: Schema.String },
) {}

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()(
  'ProjectNotFound',
  { id: Schema.String },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  'SessionNotFound',
  { id: Schema.String },
) {}

export class UnknownHarness extends Schema.TaggedError<UnknownHarness>()(
  'UnknownHarness',
  { harness: Schema.String },
) {}

export class ModelsUnavailable extends Schema.TaggedError<ModelsUnavailable>()(
  'ModelsUnavailable',
  { message: Schema.String },
) {}

/** The Turn asked for cannot be forked after. */
export class NotForkable extends Schema.TaggedError<NotForkable>()(
  'NotForkable',
  { reason: Schema.String },
) {}

export class AskFailed extends Schema.TaggedError<AskFailed>()('AskFailed', {
  message: Schema.String,
}) {}

export class SkillsUnavailable extends Schema.TaggedError<SkillsUnavailable>()(
  'SkillsUnavailable',
  { message: Schema.String },
) {}

/** The path is missing, not executable, or its `--version` failed. */
export class InvalidBinary extends Schema.TaggedError<InvalidBinary>()(
  'InvalidBinary',
  { message: Schema.String },
) {}

/** A harness failed to answer for a live Session. */
export class HarnessFailed extends Schema.TaggedError<HarnessFailed>()(
  'HarnessFailed',
  { message: Schema.String },
) {}

/** Speech to Text is not ready on this Machine; `state` says how it stands. */
export class SpeechToTextNotReady extends Schema.TaggedError<SpeechToTextNotReady>()(
  'SpeechToTextNotReady',
  { state: Schema.Literals(['Off', 'Downloading', 'Failed']) },
) {}

/** The model would not load, or could not make out the audio. */
export class TranscriptionFailed extends Schema.TaggedError<TranscriptionFailed>()(
  'TranscriptionFailed',
  { message: Schema.String },
) {}
