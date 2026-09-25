import {
  speechModels,
  type SpeechModelId,
} from '../../../../engine/transcript/index.ts';

/** Where transformers.js keeps model files; a file is stored only once fully downloaded. */
const cacheName = 'transformers-cache';

/** Models whose encoder and decoder are both in the browser cache. */
export const findDownloadedModels = async (): Promise<
  ReadonlySet<SpeechModelId>
> => {
  if (!('caches' in window) || !(await caches.has(cacheName))) {
    return new Set();
  }
  const urls = (await (await caches.open(cacheName)).keys()).map(
    (request) => request.url,
  );
  const downloaded = new Set<SpeechModelId>();
  for (const model of speechModels) {
    const files = urls.filter(
      (url) => url.includes(`/${model.repository}/`) && url.endsWith('.onnx'),
    );
    if (files.length >= 2) downloaded.add(model.id);
  }
  return downloaded;
};
