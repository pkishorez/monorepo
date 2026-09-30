import { tweak, useTweaks } from '../../common/tweaks.tsx';

/** What you can change in the App Shell Showcase: each part on or off, and how it opens. */
const TWEAKS = {
  sidebar: tweak.boolean('Sidebar', true),
  header: tweak.boolean('Header', true),
  appLink: tweak.boolean('App link atop the sidebar', true),
  labels: tweak.boolean('Group labels', true),
  account: tweak.boolean('Account menu', true),
  resizable: tweak.boolean('Resizable sidebar (wide screens)', false),
  /** Where a Swipe that opens the sidebar on a touch screen may start. */
  swipe: tweak.choice(
    'Swipe to open from',
    { anywhere: 'Anywhere', edge: 'Left edge', off: 'Off' },
    'anywhere',
  ),
};

export const useAppShellTweaks = () => useTweaks('app-shell', TWEAKS);
