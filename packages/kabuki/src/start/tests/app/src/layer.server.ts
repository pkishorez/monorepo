import { Layer } from 'effect';
import { Greeting } from './loaders.server.ts';

/** What the Loaders Require, made for each request from the Worker's env. */
export default (env: { readonly WORD?: string }) =>
  Layer.succeed(Greeting, { word: env.WORD ?? 'Read:' });
