import start from 'virtual:kabuki-start/worker';
import { host } from './host/index.ts';

/*
 * The Console Worker: Start's pages behind the Worker's own routes, the
 * User Space Durable Object class its namespace binding names, and the
 * container-backed class each run's runner runs in.
 */

export { RunnerContainer } from './runner-container/index.ts';
export { UserSpace } from './user-space/index.ts';

export default host(start);
