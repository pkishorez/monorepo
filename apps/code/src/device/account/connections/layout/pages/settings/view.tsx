import { View } from '@kestack/kabuki/react';
import {
  InfoIcon,
  KeyboardIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useDevice } from '@kestack/web-platform/ui/input';
import { type ComponentType, useLayoutEffect, useRef } from 'react';
import {
  Tab,
  TabList,
  TabTrack,
} from '../../../../../../ui/controls/settings/index.ts';
import type { SettingsTab } from '../../../../../routes/index.ts';
import { SettingsLive } from './actor.ts';
import { About } from './browser/about/index.ts';
import { General } from './browser/general/index.ts';
import { Shortcuts } from './browser/shortcuts/index.ts';
import { ConnectionSettings } from './connections/index.ts';

/*
 * Settings: its four tabs by name, and the tab open beside them. With a
 * keyboard, on a wide screen, the names are a list down the left; on
 * touch, or narrow, a row across the top. In the list each has its icon,
 * and the list stays as the tab scrolls. Shortcuts, which a touch screen
 * with no keyboard has no use for, is left out there. On a touch screen
 * the tabs sit side by side, each scrolled on its own, and a sideways
 * swipe moves them under the finger to the tab beside, as tapping its
 * name slides to it; one before the first opens the sidebar. Elsewhere
 * only the tab open is drawn, and opens at its top.
 */

const TABS: ReadonlyArray<{
  readonly tab: SettingsTab;
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly className?: string;
}> = [
  { tab: 'General', icon: SlidersHorizontalIcon },
  {
    tab: 'Shortcuts',
    icon: KeyboardIcon,
    className: 'touch:hidden keyboard:flex',
  },
  { tab: 'Connections', icon: MonitorIcon },
  { tab: 'About', icon: InfoIcon },
];

const tabId = (tab: SettingsTab) => `settings-${tab.toLowerCase()}-tab`;
const panelId = (tab: SettingsTab) => `settings-${tab.toLowerCase()}`;

export const SettingsView = View.make(
  SettingsLive,
  ({ root, model, children, send }) => {
    const { open } = model;
    const { touch, keyboard } = useDevice();
    const page = useRef<HTMLDivElement>(null);
    // As the tabs' classes say: Shortcuts only with a keyboard, or no touch.
    const shown = TABS.flatMap(({ tab }) =>
      tab === 'Shortcuts' && touch && !keyboard ? [] : [tab],
    );
    const choose = (tab: SettingsTab) => send({ _tag: 'TabChosen', tab });

    useLayoutEffect(() => {
      if (!touch) page.current?.scrollTo({ top: 0 });
    }, [open]);

    const names = (
      <TabList
        label="Settings"
        className={cn(
          'z-10 overflow-x-auto border-b border-border bg-background px-2 sm:px-4 keyboard:md:w-44 keyboard:md:flex-col keyboard:md:gap-0.5 keyboard:md:self-start keyboard:md:border-b-0 keyboard:md:bg-transparent keyboard:md:px-0',
          // Over a page that scrolls whole, it stays as the page goes under it.
          touch
            ? 'keyboard:md:mt-10'
            : 'sticky top-0 keyboard:md:top-10 keyboard:md:mt-10',
        )}
      >
        {TABS.map(({ tab, icon: Icon, className }) => (
          <Tab
            key={tab}
            id={tabId(tab)}
            controls={panelId(tab)}
            selected={open === tab}
            onSelect={() => choose(tab)}
            className={cn(
              // A list: the tab open filled.
              'keyboard:md:h-8 keyboard:md:gap-2.5 keyboard:md:px-2.5 keyboard:md:font-normal keyboard:md:after:hidden keyboard:md:hover:bg-muted/60 keyboard:md:aria-selected:bg-muted keyboard:md:aria-selected:font-medium',
              className,
            )}
          >
            <Icon className="hidden size-4 shrink-0 opacity-70 keyboard:md:block" />
            {tab}
          </Tab>
        ))}
      </TabList>
    );

    const panel = (tab: SettingsTab) => (
      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className="flex min-w-0 flex-col px-4 py-6 sm:px-6 md:py-8 keyboard:md:max-w-2xl keyboard:md:px-0 keyboard:md:pt-10 keyboard:md:pb-16"
      >
        {tab === 'General' ? (
          <General.view instance={children.general} />
        ) : tab === 'Shortcuts' ? (
          <Shortcuts.view instance={children.shortcuts} />
        ) : tab === 'Connections' ? (
          <ConnectionSettings.view instance={children.connections} />
        ) : (
          <About.view />
        )}
      </div>
    );

    if (touch)
      return (
        <div {...root} className="flex min-h-0 flex-1 flex-col">
          <TabTrack
            open={open}
            shown={shown}
            heading={names}
            panel={panel}
            onChoose={choose}
            className="mx-auto w-full max-w-4xl flex-1 keyboard:md:flex-row keyboard:md:gap-10 keyboard:md:px-6"
          />
        </div>
      );

    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={page}
          // Room for the scrollbar on both sides whether a tab needs it or
          // not, so moving between tabs never shifts the page sideways.
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable_both-edges]"
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col keyboard:md:flex-row keyboard:md:gap-12 keyboard:md:px-6">
            {names}
            <div className="min-w-0 flex-1">{panel(open)}</div>
          </div>
        </div>
      </div>
    );
  },
);

export default SettingsView;
