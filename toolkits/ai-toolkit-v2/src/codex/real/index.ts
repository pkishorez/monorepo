import { Layer } from 'effect';
import * as Router from '../shared/index.ts';
import * as AppServer from './app-server.ts';

export type Options = Router.Options & AppServer.Options;

export const driver = AppServer.layer;

export const layer = (options: Options = {}) =>
  Router.layer(options).pipe(Layer.provide(AppServer.layer(options)));
