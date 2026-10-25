import { FoldersRpc } from './folders.js';
import { HarnessesRpc } from './harnesses.js';
import { JobsRpc } from './jobs.js';
import { ProjectsRpc } from './projects.js';
import { SessionsRpc } from './sessions.js';
import { SpeechRpc } from './speech.js';
import { TurnsRpc } from './turns.js';

/*
 * The code App Group's API, which Code speaks, over WebSocket: commands that ask the engine
 * to do something, and feeds that replay every change after a cursor, then
 * stay live. It is seven groups, each in its own file, merged into one, so a
 * client reaches every procedure by its own name (`api.listFolder`):
 *
 * - harnesses  what each Coding Harness offers, and its Harness Binary.
 * - projects   folders added as Projects.
 * - sessions   Sessions started, forked, Settled, asked, and how they stand.
 * - turns      messages sent to a Session, and the Messages it emits.
 * - jobs       Background Jobs.
 * - folders    the home folder's sub-folders, listed and made.
 * - speech     Speech to Text, switched on and off, and audio turned into text.
 */

export class CodeApi extends HarnessesRpc.merge(
  ProjectsRpc,
  SessionsRpc,
  TurnsRpc,
  JobsRpc,
  FoldersRpc,
  SpeechRpc,
) {}

export * from './errors.js';
export { CreatedFolder, FolderEntry, FolderListing } from './folders.js';
export { HarnessBinary, HarnessInfo, SettingInfo } from './harnesses.js';
export { SessionJobs } from './jobs.js';
export { ProjectValue } from './projects.js';
export { SessionValue } from './sessions.js';
export { SpeechToTextState } from './speech.js';
export { Harness, WireEntity } from './wire.js';

// The records the API speaks of, as clients read them.
export {
  MessageSchema,
  ModelInfo,
  PartSchema,
  type Message,
  type Part,
  type Role,
  type ToolKind,
  type TurnEndStatus,
  type Usage,
} from '@kestack/ai-toolkit/contract';
export {
  HarnessConfigSchema,
  ProjectSchema,
  SessionSchema,
  type HarnessConfig,
  type Project,
  type Session,
  type SessionStatus,
} from '../../records/index.js';
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
} from '@kestack/ai-toolkit/contract';
export type { Json } from '@kestack/ai-toolkit/contract';
export type { HarnessName } from '@kestack/ai-toolkit/contract';
