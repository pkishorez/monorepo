// Virtual modules served by `pwa()`. Ids live in `domain/build`.

declare module 'virtual:pwa-toolkit/build' {
  import type { WorkerBuildInfo } from './domain/config/index.js';
  const info: WorkerBuildInfo;
  export default info;
}

declare module 'virtual:pwa-toolkit/client' {
  import type { ClientBuildInfo } from './domain/config/index.js';
  const info: ClientBuildInfo;
  export default info;
}
