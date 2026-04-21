import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { sessionEntity } from '../../../core/entity/session/session.js';
import type { ClaudePayload } from '../../../core/entity/session/session.js';
import { when } from '../../../core/lib/object.js';
import type { SessionRuntimeOptions } from './types.js';

type ClaudeSession = typeof sessionEntity.Type & {
  payload: typeof ClaudePayload.Type;
};

export const buildQueryOptions = (args: {
  session: ClaudeSession;
  sessionId: string;
  isNewSession: boolean;
  canUseTool: Options['canUseTool'];
  runtimeOptions?: SessionRuntimeOptions | undefined;
}): Options => {
  const { session, sessionId, isNewSession, canUseTool, runtimeOptions } = args;
  const { payload } = session;
  const isPlanMode = session.interactionMode === 'plan';

  const permissionMode = isPlanMode ? ('plan' as const) : undefined;

  return {
    model: session.model,
    cwd: session.absolutePath,
    ...(isNewSession ? { sessionId } : { resume: sessionId }),
    ...(permissionMode ? { permissionMode } : {}),
    persistSession: payload.persistSession,
    effort: payload.effort,
    ...when(payload.maxTurns > 0, { maxTurns: payload.maxTurns }),
    ...when(payload.maxBudgetUsd > 0, { maxBudgetUsd: payload.maxBudgetUsd }),
    canUseTool,
    ...runtimeOptions,
  } as Options;
};
