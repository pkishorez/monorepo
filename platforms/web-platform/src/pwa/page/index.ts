// The PWA on the page: `PwaHead` in a Kabuki Start app's Document head and
// `Pwa` around the app; the rest is for screens that show the PWA's state:
// its Status, the Install Prompt, online state, display mode, storage
// persistence and the iOS splash screens.
export * from './status/index.js';
export * from './extras/index.js';
export { Pwa, PwaHead } from './page.tsx';
export type { PwaPrompts } from './page.tsx';
export {
  pwaHead,
  pwaIncluded,
  pwaName,
  splashHead,
  splashScreens,
} from './head/index.js';
export type { PwaVersion } from './head/index.js';
