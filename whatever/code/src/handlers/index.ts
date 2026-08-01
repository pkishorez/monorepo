import { CodeRpcs } from '../contract/index.js';
import { greet } from '../orchestrators/index.js';

export const CodeHandlersLive = CodeRpcs.toLayer({
  hello: ({ name }) => greet(name),
});
