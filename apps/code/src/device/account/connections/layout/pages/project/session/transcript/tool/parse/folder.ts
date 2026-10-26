import { createContext } from 'react';

/**
 * The project's folder, so paths inside it read short. Its own module, so
 * the page that sets it does not load the transcript to do so.
 */
export const Folder = createContext<string | null>(null);
