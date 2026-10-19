import start from 'virtual:kabuki-start/worker';
import { host } from './host/index.ts';

/*
 * The Console Worker: Start's pages behind the Worker's own routes, and the
 * User Space Durable Object class its namespace binding names.
 */

export { UserSpace } from './user-space/index.ts';

export default host(start);
