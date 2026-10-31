import { app } from './app.tsx';
import { lazy, make, preload } from './draw/index.ts';

/**
 * How an Actor is drawn: `make` draws one; `lazy` loads a View's code the
 * first time it is drawn; `preload` loads the lazy Views made with these
 * ids; `app` turns the root's View into one React component that runs the
 * whole app.
 */
export const View = { make, lazy, preload, app };
