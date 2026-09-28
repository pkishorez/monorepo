import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@kstackz/ui-toolkit/components/ui/tabs';
import { HouseIcon } from '@kstackz/ui-toolkit/lucide';
import { DEMO_IDS, DEMOS, type DemoId } from './demos.ts';

/** Home and the demo's title. */
export function TopBar(props: { readonly demo: DemoId }) {
  return (
    <header className="sticky top-0 z-20 box-content flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background pt-[max(12px,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
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
    </header>
  );
}

/** Every demo along the bottom, clear of `inset` px on each side. */
export function TabBar(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
  readonly inset: number;
}) {
  return (
    <Tabs
      value={props.demo}
      onValueChange={(value) => props.onDemo(value as DemoId)}
      className="shrink-0 border-t border-border pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <TabsList
        variant="line"
        className="h-14! w-full gap-0 py-0"
        style={{ paddingInline: props.inset }}
      >
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
