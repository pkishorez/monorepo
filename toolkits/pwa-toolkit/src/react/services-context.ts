import type * as Context from 'effect/Context';
import { createContext, useContext } from 'react';
import type { PwaClientServices } from '../client/index.js';

/** `null` outside `PwaProvider`, during SSR, and until the runtime is built. */
export const ServicesContext =
  createContext<Context.Context<PwaClientServices> | null>(null);

export const useServices = () => useContext(ServicesContext);
