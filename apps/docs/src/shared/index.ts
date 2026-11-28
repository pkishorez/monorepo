export {
  KABUKI_CONTENTS,
  MONOREPO,
  NAME,
  PACKAGES,
  SHELVES,
  STD_TOOLKIT_CONTENTS,
  about,
  anchor,
  contents,
  packageOf,
  shelved,
} from './content/index.ts';
export {
  AppLive,
  DemoLive,
  DocLive,
  HomeLive,
  KabukiLive,
  SnakeRecordLive,
  StageDemoLive,
  StdToolkitDocLive,
  StdToolkitLive,
  TodosDemoLive,
  router,
} from './pages/index.ts';

export type {
  Contents,
  Doc,
  FullScreen,
  Group,
  KabukiSlug,
  Package,
  Section,
  Shelf,
  StdToolkitSlug,
} from './content/index.ts';
export type { Route } from './pages/index.ts';
