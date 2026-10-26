import { View } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useLayoutEffect, useRef } from 'react';
import type { SettingsTab } from '../../routes/index.ts';
import { SettingsLive } from './actor.ts';
import { General } from './general/index.ts';
import { MachineSettings } from './machines/index.ts';
import { Shortcuts } from './shortcuts/index.ts';
import { TabTrack } from './swipe.tsx';

/*
 * Settings: its three tabs by name, and the tab open beside them. With a
 * keyboard, on a wide screen, the names are a list down the left; on
 * touch, or narrow, a row across the top. Shortcuts, which a touch screen
 * with no keyboard has no use for, is left out there. On a touch screen
 * the tabs sit side by side, each scrolled on its own, and a sideways
 * swipe moves them under the finger to the tab beside, as tapping its
 * name slides to it; one before the first opens the sidebar. Elsewhere
 * only the tab open is drawn, and opens at its top.
 */

const TABS: ReadonlyArray<{
  readonly tab: SettingsTab;
  readonly className?: string;
}> = [
  { tab: 'General' },
  { tab: 'Shortcuts', className: 'touch:hidden keyboard:flex' },
  { tab: 'Machines' },
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
      <div
        role="tablist"
        aria-label="Settings"
        className={cn(
          'z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-2 sm:px-4 keyboard:md:w-44 keyboard:md:flex-col keyboard:md:self-start keyboard:md:border-b-0 keyboard:md:bg-transparent keyboard:md:px-0',
          // Over a page that scrolls whole, it stays as the page goes under it.
          touch
            ? 'keyboard:md:mt-10'
            : 'sticky top-0 keyboard:md:top-10 keyboard:md:mt-10',
        )}
      >
        {TABS.map(({ tab, className }) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-selected={open === tab}
            aria-controls={panelId(tab)}
            onClick={() => choose(tab)}
            className={cn(
              'focus-ring relative flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground aria-selected:text-foreground',
              // A row: the tab open underlined.
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 aria-selected:after:opacity-100',
              // A list: the tab open filled.
              'keyboard:md:h-8 keyboard:md:px-2.5 keyboard:md:after:hidden keyboard:md:hover:bg-muted keyboard:md:aria-selected:bg-muted',
              className,
            )}
          >
            {tab}
          </button>
        ))}
      </div>
    );

    const panel = (tab: SettingsTab) => (
      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className="flex min-w-0 flex-col px-4 py-6 sm:px-6 md:py-8 keyboard:md:max-w-2xl keyboard:md:px-0 keyboard:md:py-10"
      >
        {tab === 'General' ? (
          <General.view instance={children.general} />
        ) : tab === 'Shortcuts' ? (
          <Shortcuts.view instance={children.shortcuts} />
        ) : (
          <MachineSettings.view instance={children.machines} />
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
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col keyboard:md:flex-row keyboard:md:gap-10 keyboard:md:px-6">
            {names}
            <div className="min-w-0 flex-1">{panel(open)}</div>
          </div>
        </div>
      </div>
    );
  },
);
