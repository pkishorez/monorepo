import { Link } from '@tanstack/react-router';
import { Button, buttonVariants } from 'kui-toolkit/components/ui/button';
import { Switch } from 'kui-toolkit/components/ui/switch';
import { HouseIcon } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import { useLabSidebar } from '../sidebar/index.ts';
import { DEMO_IDS, DEMOS, type DemoId } from './demos.ts';

/** The sidebar's contents: the demos, the state machine switch, and Home. */
export function Menu(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
  readonly debug: boolean;
  readonly onDebug: (debug: boolean) => void;
}) {
  const sidebar = useLabSidebar();
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
      <label className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm">
        Show state machine
        <Switch
          data-testid="lab-debug"
          checked={props.debug}
          onCheckedChange={props.onDebug}
        />
      </label>
      <div className="mt-auto">
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
