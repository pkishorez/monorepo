import { shellOn } from '../shell/index.ts';

/** App Info in the app's shell on iOS: its bundle id, name, version and build. */
export const ios = shellOn('ios');
