// The opinionated way in on TanStack Start: the root document, and the
// browser as an app's platform. The Theme read on the server is
// ./client/server's.
export { webPlatform } from './platform/index.ts';
export {
  type HeadTag,
  type RootHead,
  type RootPlugin,
  webRoot,
  type WebRootOptions,
} from './root/index.ts';
