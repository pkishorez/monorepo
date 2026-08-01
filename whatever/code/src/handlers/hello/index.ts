import { HelloRpcs } from '../../contract/hello/index.js';
import { greet } from '../../orchestrators/index.js';

export const HelloHandlersLive = HelloRpcs.toLayer({
  hello: ({ name }) => greet(name),
});
