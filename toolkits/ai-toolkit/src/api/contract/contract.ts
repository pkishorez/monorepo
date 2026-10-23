import { FoldersRpc } from './folders.js';
import { HarnessesRpc } from './harnesses.js';
import { JobsRpc } from './jobs.js';
import { ProjectsRpc } from './projects.js';
import { SessionsRpc } from './sessions.js';
import { TurnsRpc } from './turns.js';

/*
 * The one API every app speaks, over WebSocket: commands that ask the engine
 * to do something, and feeds that replay every change after a cursor, then
 * stay live. It is six groups, each in its own file, merged into one, so a
 * client reaches every procedure by its own name (`api.listFolder`):
 *
 * - harnesses  what each Coding Harness offers, and its Harness Binary.
 * - projects   folders added as Projects.
 * - sessions   Sessions started, forked, Settled, asked, and how they stand.
 * - turns      messages sent to a Session, and the Messages it emits.
 * - jobs       Background Jobs.
 * - folders    the home folder's sub-folders, listed and made.
 */

export class AiApi extends HarnessesRpc.merge(
  ProjectsRpc,
  SessionsRpc,
  TurnsRpc,
  JobsRpc,
  FoldersRpc,
) {}

export * from './errors.js';
export { CreatedFolder, FolderEntry, FolderListing } from './folders.js';
export {
  HarnessBinary,
  HarnessInfo,
  ModelInfo,
  SettingInfo,
} from './harnesses.js';
export { SessionJobs } from './jobs.js';
export { ProjectValue } from './projects.js';
export { SessionValue } from './sessions.js';
export { Harness, WireEntity } from './wire.js';

// The records the API speaks of, as clients read them.
export {
  MessageSchema,
  PartSchema,
  type Message,
  type Part,
  type Role,
  type ToolKind,
  type TurnEndStatus,
  type Usage,
} from '../../services/records/projection/index.js';
export {
  HarnessConfigSchema,
  ProjectSchema,
  SessionSchema,
  type HarnessConfig,
  type Project,
  type Session,
  type SessionStatus,
} from '../../services/records/entities/index.js';
export {
  AskAnswerSchema,
  AttachmentSchema,
  BACKGROUND_JOB_KINDS,
  BackgroundJobSchema,
  BinaryInfoSchema,
  ContextUsageSchema,
  MCP_SERVER_STATES,
  McpServerStatusSchema,
  SkillSchema,
  type AskAnswer,
  type Attachment,
  type BackgroundJob,
  type BackgroundJobKind,
  type BinaryInfo,
  type ContextUsage,
  type McpServerState,
  type McpServerStatus,
  type Skill,
} from '../../services/harness/wire/index.js';
export type { Json } from '../../services/records/raw/index.js';
export type { HarnessName } from '../../services/records/raw/index.js';
