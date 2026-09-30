import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import {
  BookmarkIcon,
  type LucideIcon,
  MoonIcon,
  PhoneIcon,
  SettingsIcon,
  UsersIcon,
} from '@kstackz/ui-toolkit/lucide';
import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { appTheme } from '../../../common/theme.ts';
import { Avatar } from './avatar.tsx';
import { ME } from './data.ts';

const WIDTH = 296;

const PLACES: ReadonlyArray<{
  readonly title: string;
  readonly icon: LucideIcon;
}> = [
  { title: 'Saved messages', icon: BookmarkIcon },
  { title: 'Contacts', icon: UsersIcon },
  { title: 'Calls', icon: PhoneIcon },
  { title: 'Settings', icon: SettingsIcon },
];

/**
 * Your profile and settings, over the list from the left. It hears the app's
 * zone: a Swipe right on the header or the left edge opens it, a Swipe left
 * anywhere shuts it. Off while a thread is open, whose own right Swipe goes back.
 */
export function Sidebar(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly enabled: boolean;
}) {
  const sidebar = useSidebar({
    side: 'left',
    width: WIDTH,
    open: props.open,
    onOpenChange: props.onOpenChange,
    enabled: props.enabled,
  });
  const { theme, toggleTheme } = appTheme.useTheme();

  return (
    <>
      <motion.div
        className="absolute inset-0 z-30 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        aria-label="Profile and settings"
        className="absolute inset-y-0 left-0 z-30 flex flex-col bg-sidebar pt-[max(1.5rem,env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
        inert={!sidebar.open}
      >
        <div className="flex flex-col gap-3 px-5 pb-5">
          <Avatar chat={ME} size={64} />
          <div className="flex flex-col">
            <span className="text-[17px] font-semibold">{ME.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {ME.phone}
            </span>
          </div>
        </div>
        <nav className="flex flex-col border-t border-border py-2">
          {PLACES.map((place) => (
            <button
              key={place.title}
              type="button"
              className="flex min-h-12 items-center gap-4 px-5 text-left text-[15px] active:bg-muted"
              onClick={() => sidebar.setOpen(false)}
            >
              <place.icon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              {place.title}
            </button>
          ))}
          <label className="flex min-h-12 items-center gap-4 px-5 text-[15px]">
            <MoonIcon
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="flex-1">Dark mode</span>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </label>
        </nav>
      </motion.aside>
    </>
  );
}
