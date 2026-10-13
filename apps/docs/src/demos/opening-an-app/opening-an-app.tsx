// oxlint-disable-next-line no-restricted-imports -- Ctrl+/ is a key on the whole page, which only a listener on window hears.
import { useEffect, useState } from 'react';
import { Layer } from 'effect';
import { toReact } from '@kstackz/kabuki/react';
import { Monitor, Network, Smartphone, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@kstackz/web-platform/components/dialog';
import { KabukiDevtools } from '@kstackz/web-platform/recipes/kabuki-devtools';
import { Browser } from './browser/index.ts';
import type { Device } from './browser/index.ts';
import { AppView, PastContext } from './screens/index.ts';
import { App } from './story/index.ts';

const Demo = toReact(App, AppView, Layer.empty, { name: 'opening-an-app' });

const isToggle = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key === '/';

/**
 * Opening an app, running in a browser window like any app. How it works
 * inside, its tree of Actors and every Message, is in the devtools over it:
 * the button in the corner, or Ctrl+/.
 */
export function OpeningAnApp() {
  const runtime = Demo.useRuntime();
  const { shown, show, clear } = runtime;
  const [device, setDevice] = useState<Device>('desktop');
  const [open, setOpen] = useState(false);
  const toggle = (next: boolean) => {
    setOpen(next);
    // Closing the devtools brings the app back from any past Step.
    if (!next) show(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isToggle(event)) return;
      event.preventDefault();
      setOpen((was) => {
        if (was) show(null);
        return !was;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-muted/30">
      <header className="flex h-16 shrink-0 items-center gap-6 px-6 pr-16 max-sm:h-12 max-sm:px-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="text-sm font-medium">Opening an app</h1>
          <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
            A Kabuki app. Open the devtools to see inside it.
          </p>
        </div>
        <Devices device={device} onChange={setDevice} />
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-20 max-sm:p-0">
        <Browser device={device} address="opening-an.app" onReload={clear}>
          <PastContext value={shown !== null}>
            <Demo />
          </PastContext>
        </Browser>
      </div>

      <Dialog open={open} onOpenChange={toggle}>
        <DialogTrigger className="fixed right-5 bottom-5 flex h-9 items-center gap-2 rounded-full border border-border bg-background pr-2 pl-3.5 text-[13px] font-medium text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_-4px_rgb(0_0_0/0.1)] transition-[color,scale] duration-150 ease-out outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.97] max-sm:pr-3.5">
          <Network className="size-3.5" />
          Devtools
          <kbd className="rounded-md border border-border px-1.5 py-0.5 font-sans text-[11px] max-sm:hidden">
            Ctrl /
          </kbd>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-transparent p-0 ring-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Kabuki devtools</DialogTitle>
          <KabukiDevtools
            runtime={runtime}
            dotted={false}
            className="bg-background/45 backdrop-blur-[3px]"
          />
          <DialogClose className="absolute top-3 left-3 flex h-8 items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 pr-2.5 pl-2 text-xs font-medium text-red-600 backdrop-blur-sm transition-[background-color,scale] duration-150 ease-out outline-offset-2 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-500 active:scale-[0.97] dark:text-red-400">
            <X className="size-3.5" />
            Close devtools
            <kbd className="rounded border border-red-500/30 px-1 font-sans text-[10px]">
              Ctrl /
            </kbd>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** Which device the window is sized for. */
function Devices({
  device,
  onChange,
}: {
  readonly device: Device;
  readonly onChange: (device: Device) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-background p-0.5 max-sm:hidden">
      {(
        [
          ['desktop', Monitor, 'Desktop'],
          ['mobile', Smartphone, 'Mobile'],
        ] as const
      ).map(([each, Icon, label]) => (
        <button
          key={each}
          type="button"
          aria-pressed={device === each}
          onClick={() => onChange(each)}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 outline-offset-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
