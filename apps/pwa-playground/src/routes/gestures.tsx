import { Link, createFileRoute } from '@tanstack/react-router';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { HouseIcon } from '@kstackz/ui-toolkit/lucide';
import { ThemeToggle } from '../components/index.ts';

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  component: Gestures,
});

/** The Gesture Lab's place, until its demo is rebuilt on useGesture. */
function Gestures() {
  return (
    <div className="fixed inset-0 flex h-dvh flex-col bg-background text-foreground">
      <header className="box-content flex h-12 shrink-0 items-center gap-1 border-b border-border pt-[max(12px,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
        <Link
          to="/"
          aria-label="Home"
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon',
            className: 'size-11',
          })}
        >
          <HouseIcon aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-1 text-base font-semibold">
          Gesture Lab
        </h1>
        <ThemeToggle />
      </header>
      <main
        data-testid="gestures-pending"
        className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        Demo pending
      </main>
    </div>
  );
}
