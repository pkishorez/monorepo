import { useSyncExternalStore } from 'react';
import { detect, type Api } from '../../core/index.ts';

const never = () => () => {};

/**
 * Which HTML-in-Canvas API this browser has: `current`, `legacy`, `none`,
 * or `pending` while rendering on the server and hydrating.
 */
export const useHtmlCanvasSupport = (): Api | 'pending' =>
  useSyncExternalStore(never, detect, () => 'pending' as const);
