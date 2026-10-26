import { FoldersRpc } from './folders.js';
import { HarnessesRpc } from './harnesses.js';
import { JobsRpc } from './jobs.js';
import { ProjectsRpc } from './projects.js';
import { QuestionsRpc } from './questions.js';
import { SessionsRpc } from './sessions.js';
import { SpeechRpc } from './speech.js';
import { TurnsRpc } from './turns.js';

/*
 * The code Plugin's API, which Code speaks, over WebSocket: commands that ask the engine
 * to do something, and feeds that replay every change after a cursor, then
 * stay live. It is eight groups, each in its own file, merged into one, so a
 * client reaches every procedure by its own name (`api.listFolder`):
 *
 * - harnesses  what each Coding Harness offers, and its Harness Binary.
 * - projects   folders added as Projects.
 * - sessions   Sessions started, forked, Settled, asked, and how they stand.
 * - turns      messages sent to a Session, and the Messages it emits.
 * - jobs       Background Jobs.
 * - questions  Agent Questions, and the user's answers to them.
 * - folders    the home folder's sub-folders, listed and made.
 * - speech     Speech to Text, switched on and off, and audio turned into text.
 *
 * Every value it sends is an ESchema, as Cloud Connect's are, so Code reads
 * a Connection that lags behind it; a payload that names one Rpc alone is an
 * ESchema of its own, named for it.
 */

export class CodeApi extends HarnessesRpc.merge(
  ProjectsRpc,
  SessionsRpc,
  TurnsRpc,
  JobsRpc,
  QuestionsRpc,
  FoldersRpc,
  SpeechRpc,
) {}

export * from './errors.js';
export { CreatedFolder, FolderEntry, FolderListing } from './folders.js';
export { HarnessAccountInfo, HarnessInfo, SettingInfo } from './harnesses.js';
export { SessionJobs } from './jobs.js';
export { ProjectValue } from './projects.js';
export { SessionQuestions } from './questions.js';
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
  HarnessAccountSchema,
  ProjectSchema,
  SessionSchema,
  type HarnessAccountRecord,
  type Project,
  type Session,
  type SessionStatus,
} from '../../records/index.js';
export {
  AgentQuestionSchema,
  AskAnswerSchema,
  AttachmentSchema,
  BACKGROUND_JOB_KINDS,
  BackgroundJobSchema,
  BinaryInfoSchema,
  ContextUsageSchema,
  MCP_SERVER_STATES,
  McpServerStatusSchema,
  QuestionAnswerSchema,
  QuestionItemSchema,
  QuestionOptionSchema,
  SkillSchema,
  type AgentQuestion,
  type AskAnswer,
  type Attachment,
  type BackgroundJob,
  type BackgroundJobKind,
  type BinaryInfo,
  type ContextUsage,
  type McpServerState,
  type McpServerStatus,
  type QuestionAnswer,
  type QuestionItem,
  type QuestionOption,
  type Skill,
} from '@kestack/ai-toolkit/contract';
export type { Json } from '@kestack/ai-toolkit/contract';
export type { HarnessName } from '@kestack/ai-toolkit/contract';
