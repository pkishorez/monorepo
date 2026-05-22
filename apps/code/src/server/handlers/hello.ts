import { AppRpcs } from '../api/app.js';
import * as Hello from '../../orchestration/hello.js';

export const HelloHandlersLive = AppRpcs.toLayer({
  getHello: () => Hello.getHello,
  streamHello: () => Hello.streamHello,
});
