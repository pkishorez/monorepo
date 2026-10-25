// Virtual modules served by `pwa()`. Ids live in `contract/build`.

declare module 'virtual:pwa-toolkit/build' {
  import type { WorkerBuildInfo } from './contract/config/index.js';
  const info: WorkerBuildInfo;
  export default info;
}

declare module 'virtual:pwa-toolkit/client' {
  import type { ClientBuildInfo } from './contract/config/index.js';
  const info: ClientBuildInfo;
  export default info;
  /** Whether this build is a PWA: `false` under `noPwa()`, where `info` is not there. */
  export const included: boolean;
}
