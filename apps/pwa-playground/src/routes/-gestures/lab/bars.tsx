import { Link } from '@tanstack/react-router';
import {
  Button,
  buttonVariants,
} from '@kstackz/ui-toolkit/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/ui-toolkit/components/ui/tabs';
import {
  CircleQuestionMarkIcon,
  HouseIcon,
  MenuIcon,
} from '@kstackz/ui-toolkit/lucide';
import { useLabSidebar } from '../sidebar/index.ts';
import { DEMO_IDS, DEMOS, type DemoId } from './demos.ts';

/** Home, the demo's title, its tutorial and the menu. */
export function TopBar(props: {
  readonly demo: DemoId;
  readonly onHelp: () => void;
}) {
  const sidebar = useLabSidebar();
  return (
    <header className="sticky top-0 z-20 box-content flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background pt-[env(safe-area-inset-top)] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
      <Link
        to="/"
        aria-label="Home"
        data-testid="lab-home"
        className={buttonVariants({
          variant: 'ghost',
          size: 'icon',
          className: 'size-11',
        })}
      >
        <HouseIcon aria-hidden="true" />
      </Link>
      <h1
        data-testid="lab-title"
        className="min-w-0 flex-1 truncate px-1 text-base font-semibold"
      >
        {DEMOS[props.demo].title}
      </h1>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="How this demo works"
        data-testid="lab-help"
        onClick={props.onHelp}
      >
        <CircleQuestionMarkIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Menu"
        data-testid="lab-menu"
        onClick={sidebar.open}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
    </header>
  );
}

/** Every demo along the bottom. */
export function TabBar(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
}) {
  return (
    <Tabs
      value={props.demo}
      onValueChange={(value) => props.onDemo(value as DemoId)}
      className="shrink-0 border-t border-border pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <TabsList variant="line" className="h-14! w-full gap-0 p-0">
        {DEMO_IDS.map((id) => {
          const { title, Icon } = DEMOS[id];
          return (
            <TabsTrigger
              key={id}
              value={id}
              data-testid={`lab-tab-${id}`}
              className="h-full flex-col gap-0.5 text-[11px]"
            >
              <Icon className="size-5" />
              {title}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
