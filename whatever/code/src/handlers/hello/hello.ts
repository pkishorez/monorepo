import { HelloRpcs } from '../../contract/index.js';
import { greet } from '../../orchestrators/index.js';

export const HelloHandlersLive = HelloRpcs.toLayer({
  hello: ({ name }) => greet(name),
});
