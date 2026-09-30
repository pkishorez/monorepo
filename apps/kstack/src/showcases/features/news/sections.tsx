import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import { cn } from '@kstackz/ui-toolkit/utils';
import type { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { TABS } from './data.ts';

export interface Settings {
  readonly images: boolean;
  readonly large: boolean;
}

/** Its width in px. */
export const SECTIONS_WIDTH = 280;

/** The left sidebar: every section to jump to, and how the feeds look. */
export function Sections(props: {
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly page: number;
  readonly onSection: (index: number) => void;
  readonly settings: Settings;
  readonly onSettings: (settings: Settings) => void;
}) {
  const { sidebar, settings } = props;
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        aria-label="Sections"
        className="absolute inset-y-0 left-0 z-20 flex flex-col gap-4 overflow-y-auto bg-sidebar pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pl-[env(safe-area-inset-left)] shadow-xl"
        style={{ width: SECTIONS_WIDTH, x: sidebar.x }}
      >
        <nav className="flex flex-col gap-0.5 px-2 pt-2">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              aria-current={props.page === i ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-150',
                props.page === i
                  ? 'bg-sidebar-accent font-medium'
                  : 'hover:bg-sidebar-accent/60',
              )}
              onClick={() => props.onSection(i)}
            >
              <tab.icon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              {tab.title}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 px-2">
          <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
            Settings
          </p>
          <Setting
            label="Images"
            checked={settings.images}
            onChange={(images) => props.onSettings({ ...settings, images })}
          />
          <Setting
            label="Large text"
            checked={settings.large}
            onChange={(large) => props.onSettings({ ...settings, large })}
          />
        </div>
      </motion.aside>
    </>
  );
}

function Setting(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm">
      {props.label}
      <Switch checked={props.checked} onCheckedChange={props.onChange} />
    </label>
  );
}
