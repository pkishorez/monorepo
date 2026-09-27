import { Link } from '@tanstack/react-router';
import {
  Button,
  buttonVariants,
} from '@kstackz/ui-toolkit/components/ui/button';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import { HouseIcon, MoonIcon, SunIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { appTheme } from '../../../lib/theme.ts';
import { useLabSidebar } from '../sidebar/index.ts';
import { DEMO_IDS, DEMOS, type DemoId } from './demos.ts';

/** The sidebar's contents: the demos, the feedback and theme switches, and Home. */
export function Menu(props: {
  readonly demo: DemoId;
  readonly debug: boolean;
  readonly haptics: boolean;
  readonly onDemo: (demo: DemoId) => void;
  readonly onDebug: (debug: boolean) => void;
  readonly onHaptics: (haptics: boolean) => void;
}) {
  const sidebar = useLabSidebar();
  const { theme, toggleTheme } = appTheme.useTheme();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <p className="px-2 pt-2 text-sm font-semibold">Gesture Lab</p>
      <ul className="flex flex-col gap-0.5">
        {DEMO_IDS.map((id) => {
          const { title, Icon } = DEMOS[id];
          const active = id === props.demo;
          return (
            <li key={id}>
              <Button
                variant="ghost"
                data-testid={`lab-menu-${id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'h-11 w-full justify-start gap-3 px-2',
                  active && 'bg-sidebar-active text-sidebar-active-foreground',
                )}
                onClick={() => {
                  props.onDemo(id);
                  sidebar.close();
                }}
              >
                <Icon className="size-5" />
                {title}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <div className="mb-2 flex h-11 items-center justify-between px-2 text-sm text-muted-foreground">
          <label htmlFor="gesture-touch-feedback">Touch feedback</label>
          <Switch
            id="gesture-touch-feedback"
            checked={props.debug}
            onCheckedChange={props.onDebug}
            aria-label="Show touch feedback"
          />
        </div>
        <div className="mb-2 flex h-11 items-center justify-between px-2 text-sm text-muted-foreground">
          <label htmlFor="gesture-haptics">Haptics</label>
          <Switch
            id="gesture-haptics"
            checked={props.haptics}
            onCheckedChange={props.onHaptics}
            aria-label="Vibrate on taps and Holds"
          />
        </div>
        <div className="mb-2 flex items-center justify-between px-2 text-sm text-muted-foreground">
          Theme
          <Button
            variant="ghost"
            size="icon"
            className="size-11 touch-manipulation"
            aria-label={
              theme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
        <Link
          to="/"
          className={buttonVariants({
            variant: 'outline',
            className: 'h-11 w-full justify-start gap-3',
          })}
        >
          <HouseIcon aria-hidden="true" />
          Home
        </Link>
      </div>
    </div>
  );
}
