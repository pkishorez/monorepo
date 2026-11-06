import { createContext } from 'react';
import type { Lamp } from '../../core/index.ts';

/** How a lamp inside an <HtmlCanvas> joins it: returns its removal. */
export type Lamps = { readonly add: (lamp: Lamp) => () => void };

/** The <HtmlCanvas> around a component, if any. */
export const LampsContext = createContext<Lamps | null>(null);
