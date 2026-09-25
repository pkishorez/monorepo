import {
  speechModels,
  type SpeechModel,
  type SpeechModelId,
} from '../../../../engine/transcript/index.ts';

/** Where transformers.js keeps model files; a file is stored only once fully downloaded. */
const cacheName = 'transformers-cache';

/** How much of a model the browser holds: nothing, some files, or encoder and decoder. */
export type ModelCache = 'none' | 'partial' | 'downloaded';

const openCache = async (): Promise<Cache | null> =>
  'caches' in window && (await caches.has(cacheName))
    ? caches.open(cacheName)
    : null;

const belongsTo = (model: SpeechModel, url: string): boolean =>
  url.includes(`/${model.repository}/`);

export const readModelCaches = async (): Promise<
  ReadonlyMap<SpeechModelId, ModelCache>
> => {
  const cache = await openCache();
  const urls = cache ? (await cache.keys()).map((request) => request.url) : [];
  return new Map(
    speechModels.map((model) => {
      const files = urls.filter((url) => belongsTo(model, url));
      const weights = files.filter((url) => url.endsWith('.onnx'));
      const state: ModelCache =
        weights.length >= 2
          ? 'downloaded'
          : files.length > 0
            ? 'partial'
            : 'none';
      return [model.id, state];
    }),
  );
};

/** Deletes every cached file of the model, so the next load downloads it again. */
export const clearModelCache = async (id: SpeechModelId): Promise<void> => {
  const cache = await openCache();
  if (cache === null) return;
  const model = speechModels.find((entry) => entry.id === id)!;
  for (const request of await cache.keys()) {
    if (belongsTo(model, request.url)) await cache.delete(request);
  }
};
