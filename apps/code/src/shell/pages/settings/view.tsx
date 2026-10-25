import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { cn } from '@kestack/web-platform/ui/components/utils';
import * as routes from '../../routes/index.ts';
import { SettingsLive } from './actor.ts';
import { General } from './general/index.ts';
import { MachineSettings } from './machines/index.ts';
import { Shortcuts } from './shortcuts/index.ts';

/*
 * Settings: its three pages as tabs, and the page open beside them. With a
 * keyboard, on a wide screen, the tabs are a list down the left; on touch,
 * or narrow, a row across the top that stays as the page scrolls under it.
 * Shortcuts, which a touch screen with no keyboard has no use for, is left
 * out there.
 */

const TABS: ReadonlyArray<{
  readonly tab: routes.SettingsTab;
  readonly label: string;
  readonly className?: string;
}> = [
  { tab: 'General', label: 'General' },
  {
    tab: 'Shortcuts',
    label: 'Shortcuts',
    className: 'touch:hidden keyboard:flex',
  },
  { tab: 'Machines', label: 'Machines' },
];

export const SettingsView = View.make(
  SettingsLive,
  ({ root, props, children }) => {
    const open = props.route.page?._tag ?? 'General';
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col keyboard:md:flex-row keyboard:md:gap-10 keyboard:md:px-6 keyboard:md:py-10">
          <nav
            aria-label="Settings"
            className="sticky top-0 z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-2 sm:px-4 keyboard:md:top-10 keyboard:md:w-44 keyboard:md:flex-col keyboard:md:self-start keyboard:md:border-b-0 keyboard:md:bg-transparent keyboard:md:px-0"
          >
            {TABS.map(({ tab, label, className }) => (
              <Router.Link
                key={tab}
                to={routes.settings(tab)}
                aria-current={open === tab ? 'page' : undefined}
                className={cn(
                  'focus-ring relative flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:text-foreground',
                  // A row: the tab open underlined.
                  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 aria-[current=page]:after:opacity-100',
                  // A list: the tab open filled.
                  'keyboard:md:h-8 keyboard:md:px-2.5 keyboard:md:after:hidden keyboard:md:hover:bg-muted keyboard:md:aria-[current=page]:bg-muted',
                  className,
                )}
              >
                {label}
              </Router.Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 md:py-8 keyboard:md:max-w-2xl keyboard:md:p-0">
            {children.General ? (
              <General.view instance={children.General} />
            ) : children.Shortcuts ? (
              <Shortcuts.view instance={children.Shortcuts} />
            ) : children.Machines ? (
              <MachineSettings.view instance={children.Machines} />
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);
