import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { HARNESS_NAMES } from '@kestack/ai-toolkit/contract';

/**
 * - present  the folder is there.
 * - missing  the folder is gone: no Turn can run in it until it is back.
 */
export const PROJECT_FOLDERS = ['present', 'missing'] as const;
export type ProjectFolder = (typeof PROJECT_FOLDERS)[number];

/**
 * A folder on this machine that sessions run in. Its name is the folder's
 * name. v2 says whether the folder is still there, as the Connection last
 * found it; a v1 Project's was.
 */
export const ProjectSchema = EntityESchema.make('AiProject', 'id', {
  path: Schema.String,
  name: Schema.String,
  createdAt: Schema.Finite,
})
  .evolve('v2', { folder: Schema.Literals(PROJECT_FOLDERS) }, (v1) => ({
    ...v1,
    folder: 'present' as const,
  }))
  .build();

export type Project = typeof ProjectSchema.Type;

/**
 * - idle         its last turn finished, or it has none.
 * - running      a turn is under way.
 * - cancelled    its last turn was stopped by the user.
 * - failed       its last turn ended in an error.
 * - interrupted  its last turn was cut off by the server stopping.
 */
export const SESSION_STATUSES = [
  'idle',
  'running',
  'cancelled',
  'failed',
  'interrupted',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

const ForkedFrom = Schema.Struct({
  sessionId: Schema.String,
  turnId: Schema.String,
});

/**
 * One conversation with a Coding Harness in a Project's folder. v2 runs it
 * as a Harness Account; a v1 Session ran its harness's Default Account,
 * whose id is the harness's name.
 */
export const SessionSchema = EntityESchema.make('AiSession', 'id', {
  projectId: Schema.String,
  harness: Schema.Literals(HARNESS_NAMES),
  model: Schema.String,
  /** Values for the harness's Settings, by key. */
  settings: Schema.Record(Schema.String, Schema.String),
  title: Schema.String,
  status: Schema.Literals(SESSION_STATUSES),
  /** The harness's own session id, to resume its context after a restart. */
  nativeId: Schema.NullOr(Schema.String),
  createdAt: Schema.Finite,
  /**
   * The Session and Turn this one was forked after; null when it was not.
   * That Session's Messages hold the Turn, up to its `turnEnded`.
   */
  forkedFrom: Schema.NullOr(ForkedFrom),
  /** When the user Settled it; null while it is not Settled. */
  settledAt: Schema.NullOr(Schema.Finite),
  /** When a Turn last started in it, or when it was made. */
  activeAt: Schema.Finite,
  /** When its last Turn ended, however it ended; null until one has. */
  endedAt: Schema.NullOr(Schema.Finite),
})
  .evolve(
    'v2',
    {
      /** The Harness Account it runs as, of its harness; never changes. */
      account: Schema.String,
    },
    (v1) => ({ ...v1, account: v1.harness }),
  )
  .build();

export type Session = typeof SessionSchema.Type;

/** What each harness's Default Account is named. */
const DEFAULT_NAMES = { claude: 'Claude', codex: 'Codex' } as const;

/**
 * A Harness Account: one login of a Coding Harness, run with its own
 * Harness Binary and config folder. Each harness has a Default Account,
 * whose id is the harness's name, even with no record; others have ids of
 * their own. v1 kept only a harness's binary, by harness name: the
 * Default Account's.
 */
export const HarnessAccountSchema = EntityESchema.make(
  'AiHarnessConfig',
  'id',
  {
    harness: Schema.Literals(HARNESS_NAMES),
    /** The executable to run; null runs the harness's name from PATH. */
    binaryPath: Schema.NullOr(Schema.String),
    updatedAt: Schema.Finite,
  },
)
  .evolve(
    'v2',
    {
      /** What the user calls it, such as "Claude work". */
      name: Schema.String,
      /** Its config folder (CLAUDE_CONFIG_DIR, CODEX_HOME); null for the harness's own. */
      configFolder: Schema.NullOr(Schema.String),
    },
    (v1) => ({ ...v1, name: DEFAULT_NAMES[v1.harness], configFolder: null }),
  )
  .build();

export type HarnessAccountRecord = typeof HarnessAccountSchema.Type;

/** A harness's Default Account as it is before the user changes it. */
export const defaultAccount = (
  harness: HarnessAccountRecord['harness'],
): HarnessAccountRecord => ({
  id: harness,
  harness,
  name: DEFAULT_NAMES[harness],
  binaryPath: null,
  configFolder: null,
  updatedAt: 0,
});

/** Whether `id` is a harness's Default Account, whose id is the harness's name. */
export const isDefaultAccount = (id: string) =>
  (HARNESS_NAMES as ReadonlyArray<string>).includes(id);
