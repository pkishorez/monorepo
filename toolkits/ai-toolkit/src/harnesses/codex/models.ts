/**
 * The model new sessions use: what Codex 0.154's `model/list` marked
 * `isDefault` on a ChatGPT account (gpt-6-astra; the account also listed
 * gpt-5.6-sol, gpt-5.6-terra and gpt-5.6-luna).
 */
export const DEFAULT_MODEL = 'gpt-6-astra';

/** Variants that are not chat-and-tools coding models Codex can drive. */
const NOT_FOR_CODEX =
  /(?:^|-)(?:pro|chat|image|realtime|audio|tts|transcribe|search|embedding)(?:-|$)/;

/**
 * Whether Codex runs a models.dev `openai` model: the GPT-5 generation and
 * later, codex variants included. Older GPTs, o-series, image, embedding,
 * realtime and pro models are not Codex models.
 */
export const acceptsModel = (modelId: string): boolean => {
  const generation = /^gpt-(\d+)(?:\.\d+)?(?:-|$)/.exec(modelId);
  if (generation === null) return false;
  return Number(generation[1]) >= 5 && !NOT_FOR_CODEX.test(modelId);
};
