import type { WorkerEnv } from '../alchemy.run';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
