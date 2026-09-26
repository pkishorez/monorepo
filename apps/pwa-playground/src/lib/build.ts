import { BUILD_ID_META_NAME } from './meta.ts';

export const buildLabel = __BUILD_LABEL__;
export const buildPreset = __PWA_PRESET__;
export const pwaEnabled = __PWA_ENABLED__;
export const updateMode = __PWA_UPDATE_MODE__;

/** The Build ID the server rendered into this page; null before hydration. */
export const pageBuildId = (): string | null =>
  typeof document === 'undefined'
    ? null
    : (document
        .querySelector(`meta[name="${BUILD_ID_META_NAME}"]`)
        ?.getAttribute('content') ?? null);
