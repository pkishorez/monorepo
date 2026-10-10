import { createContext, use } from 'react';
import type { Sky } from './kit.js';

/** The weather over the whole Stage, for the Look to draw in every sky. */
export const SkyContext = createContext<Sky>('clear');
export const useSky = () => use(SkyContext);

/** Whether a Bay sits among others on a site, so it draws smaller. */
export const CompactContext = createContext(false);
export const useCompact = () => use(CompactContext);
