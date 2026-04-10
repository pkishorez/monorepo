import { Effect } from "effect";
import { ulid } from "ulid";
import { codexEventSqliteEntity } from "../../db/entities/codex.js";
import { turnSqliteEntity } from "../../db/entities/turn.js";
import { sessionSqliteEntity } from "../../db/entities/session.js";
import { initSessionsForType } from "../shared/session.js";
import { markTurnsInterrupted } from "../shared/turn.js";
import type { PromptContent } from "../shared/schema.js";
import type { QuestionItem } from "../../entity/turn/turn.js";
import type { ToolRequestUserInputQuestion } from "./generated/v2/ToolRequestUserInputQuestion.js";

export { markTurnStatus } from "../shared/turn.js";

export const isStreamEvent = (method: string): boolean =>
  method.endsWith("Delta") ||
  method.endsWith("delta") ||
  method.endsWith("progress") ||
  method.endsWith("sessionUpdated");

export const initSessions = initSessionsForType("codex", markTurnsInterrupted);

export const persistNewTurn = (
  sessionId: string,
  turnId: string,
  prompt: typeof PromptContent.Type,
  model: string,
) => {
  const textContent = typeof prompt === "string"
    ? prompt
    : prompt
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

  return Effect.all([
    sessionSqliteEntity.update({ sessionId }, { status: "in_progress" }),
    turnSqliteEntity.insert({
      id: turnId,
      type: "codex",
      sessionId,
      status: "in_progress",
      payload: {
        type: "codex",
        model,
        sdkTurnId: null,
        usage: null,
        error: null,
        pendingQuestions: {},
      },
    }),
    codexEventSqliteEntity.insert({
      id: ulid(),
      sessionId,
      turnId,
      data: {
        method: "item/started",
        params: {
          threadId: sessionId,
          turnId,
          item: {
            type: "userMessage",
            id: ulid(),
            content: [{ type: "text", text: textContent, text_elements: [] }],
          },
        },
      },
    }),
  ]).pipe(Effect.orDie);
};

// ── User-input conversion utilities ──────────────────────────────────

/**
 * Validates and converts Codex questions to our canonical QuestionItem format.
 * Returns the converted questions alongside the original Codex question IDs
 * (needed for answer mapping later).
 *
 * Questions are silently dropped if required fields are missing/empty or
 * options are invalid — matching the Codex documentation spec.
 */
export function toUserInputQuestions(codexQuestions: ToolRequestUserInputQuestion[]): {
  questions: Array<typeof QuestionItem.Type>;
  codexQuestionIds: string[];
} {
  const questions: Array<typeof QuestionItem.Type> = [];
  const codexQuestionIds: string[] = [];

  for (const q of codexQuestions) {
    const id = q.id?.trim();
    const header = q.header?.trim();
    const question = q.question?.trim();
    if (!id || !header || !question) continue;

    // options: null or empty array → free-form; non-empty array → validate each
    const rawOptions = q.options;

    const validOptions: Array<{ label: string; description: string }> = [];
    if (Array.isArray(rawOptions) && rawOptions.length > 0) {
      let allValid = true;
      for (const opt of rawOptions) {
        const label = opt.label?.trim();
        const description = opt.description?.trim();
        if (!label || !description) {
          allValid = false;
          break;
        }
        validOptions.push({ label, description });
      }
      if (!allValid) continue;
    }

    questions.push({
      question,
      header,
      options: validOptions,
      multiSelect: false,
    });
    codexQuestionIds.push(id);
  }

  return { questions, codexQuestionIds };
}

/**
 * Converts frontend answers back to the Codex subprocess format
 * (keyed by Codex question ID, wrapped in `{ answers: [] }`).
 *
 * Answers are looked up by **string index** first (e.g. `"0"`, `"1"`),
 * then by question text as a fallback.  Index-based keys are preferred
 * because duplicate question texts would otherwise cause ambiguity.
 */
export function toCodexUserInputAnswers(
  answers: Record<string, string>,
  codexQuestionIds: string[],
  questions: ReadonlyArray<typeof QuestionItem.Type>,
): Record<string, { answers: string[] }> {
  const result: Record<string, { answers: string[] }> = {};

  for (let i = 0; i < questions.length; i++) {
    const codexId = codexQuestionIds[i];
    if (!codexId) continue;

    // Prefer index-based key, fall back to question text
    const answer = answers[String(i)] ?? answers[questions[i]?.question ?? ""];
    if (answer !== undefined) {
      result[codexId] = { answers: [answer] };
    }
  }

  return result;
}

/**
 * Safely extracts `{ answers: Record<string, string> }` from the
 * loosely-typed `ToolResponse.updatedInput`.  Non-string values are
 * silently dropped so callers never deal with unexpected types.
 */
export function extractAnswersFromInput(
  updatedInput: Record<string, unknown> | undefined,
): Record<string, string> {
  const raw = updatedInput?.["answers"];
  if (typeof raw !== "object" || raw === null) return {};

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string") result[key] = val;
  }
  return result;
}
