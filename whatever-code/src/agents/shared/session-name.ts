import type { PromptContent } from "./schema.js";

const SESSION_NAME_MAX_LENGTH = 100;

/** Extract plain text from a PromptContent value. */
export function promptToText(
  prompt: typeof PromptContent.Type,
  separator = " ",
): string {
  if (typeof prompt === "string") return prompt;
  return prompt
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(separator);
}

/** Derive an initial session name from the prompt — first sentence, truncated. */
export const deriveSessionName = (prompt: typeof PromptContent.Type): string => {
  const trimmed = promptToText(prompt).trim().replace(/\s+/g, " ");
  if (!trimmed) return "New Session";

  // Take up to the first sentence-ending punctuation
  const sentenceEnd = trimmed.search(/[.!?\n]/);
  const firstSentence =
    sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd) : trimmed;

  if (firstSentence.length <= SESSION_NAME_MAX_LENGTH) return firstSentence;
  return firstSentence.slice(0, SESSION_NAME_MAX_LENGTH - 1) + "…";
};
