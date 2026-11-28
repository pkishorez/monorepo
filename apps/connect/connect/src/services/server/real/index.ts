import { Layer } from 'effect';
import { Server } from '../contract/index.js';
import { listen } from './server.js';

export const layer = Layer.succeed(Server, Server.of({ listen }));
