// Every request the server sends back is answered at once, without a person:
// approvals are granted in full, elicitations are declined so the agent
// carries on. A question the agent asks is declined too, unless an Agent
// takes it to ask the user (see `AppServer.takeQuestions`).

import type { UserInputResponse } from './protocol.js';

export type Answer =
  | { readonly result: unknown }
  | { readonly error: { readonly code: number; readonly message: string } };

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

/** Declines every question of an `item/tool/requestUserInput` request. */
export const declined = (params: unknown): UserInputResponse => ({
  answers: Object.fromEntries(
    questionIds(params).map((id) => [id, { answers: [] }]),
  ),
});

const questionIds = (params: unknown): ReadonlyArray<string> => {
  const questions = record(params).questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((question) => {
    const id = record(question).id;
    return typeof id === 'string' ? [id] : [];
  });
};

/** Grants every permission the request names, for the whole session. */
const grantAll = (params: unknown) => {
  const requested = record(record(params).permissions);
  const granted: Record<string, unknown> = {};
  if (requested.network != null) granted.network = requested.network;
  if (requested.fileSystem != null) granted.fileSystem = requested.fileSystem;
  return { permissions: granted, scope: 'session' };
};

export const answer = (method: string, params: unknown): Answer => {
  switch (method) {
    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval':
      return { result: { decision: 'acceptForSession' } };
    case 'applyPatchApproval':
    case 'execCommandApproval':
      return { result: { decision: 'approved_for_session' } };
    case 'item/permissions/requestApproval':
      return { result: grantAll(params) };
    case 'item/tool/requestUserInput':
      return { result: declined(params) };
    case 'mcpServer/elicitation/request':
      return { result: { action: 'decline', content: null, _meta: null } };
    case 'currentTime/read':
      return { result: { currentTimeAt: Math.floor(Date.now() / 1000) } };
    default:
      return {
        error: {
          code: -32_601,
          message: `Unsupported server request: ${method}`,
        },
      };
  }
};
