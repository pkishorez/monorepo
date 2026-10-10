// oxlint-disable-next-line no-restricted-imports -- Space anywhere on the page is a window listener, which only an effect can add and remove.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { Entry } from 'effect-oak';
import type { AppRuntime } from 'effect-oak/react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@kstackz/web-platform/components/sheet';
import { Messages } from './messages.js';
import { Scrubber } from './scrubber.js';
import { TopBar } from './top-bar.js';

/** An app made with `toReact`: what the shell runs and inspects. */
type OakApp = ComponentType & { readonly useRuntime: () => AppRuntime };

/*
 * The frame every Effect Oak demo runs in. The app fills the middle, Live or
 * in Replay at an entry. The live app keeps running while an entry is shown,
 * and the past cannot be used: it is `inert`, as is a stopped app. Stop ends
 * every Command and Lifetime; Start resumes, or, while an entry is shown,
 * grows a new Branch from it. Space switches between Live and the entry shown
 * last. The Messages open beside it, or from the bottom on a phone.
 */
export const Shell = ({
  app: App,
  menu,
}: {
  readonly app: OakApp;
  /** Where the demo's name goes: a menu to go home or to another demo. */
  readonly menu: ReactNode;
}) => {
  const [inspecting, setInspecting] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  /** Another Branch to walk, picked where it splits off; `null` follows the Head's. */
  const [walked, setWalked] = useState<ReadonlyArray<Entry> | null>(null);
  const narrow = useNarrow();
  const runtime = App.useRuntime();
  const { log, shown, running, children } = runtime;
  const branch = walked ?? log;

  /** Show an entry, remembering it for Space and Replay. */
  const show = (entry: number) => {
    setLast(entry);
    runtime.show(entry);
  };
  const replay = () => {
    const entry = branch.find(({ id }) => id === last) ?? branch.at(-1);
    if (entry) show(entry.id);
  };
  const live = () => runtime.show(null);
  useSpace(shown === null ? replay : live);

  /** Walk the Branch that splits off after `index` at `child`, down to its latest entry. */
  const walk = (index: number, child: Entry) => {
    const path = [...branch.slice(0, index + 1), child];
    for (let next = children(child.id); next.length > 0;) {
      const latest = next.at(-1)!;
      path.push(latest);
      next = children(latest.id);
    }
    setWalked(path);
    show(child.id);
  };
  const start = (from?: number | null) => {
    setWalked(null);
    runtime.start(from);
  };

  const messages = (
    <Messages
      branch={branch}
      shown={shown}
      children={children}
      onShow={show}
      onBranch={walk}
      onHeadBranch={walked ? () => setWalked(null) : undefined}
      onClose={() => setInspecting(false)}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TopBar
        menu={menu}
        running={running}
        forking={shown !== null}
        onStop={runtime.stop}
        onStart={() => start(shown ?? undefined)}
        replaying={shown !== null}
        onLive={live}
        onReplay={replay}
        onRestart={() => {
          setLast(null);
          start(null);
        }}
        messages={branch.length}
        inspecting={inspecting}
        onInspect={() => setInspecting((open) => !open)}
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            inert={shown !== null || !running}
            className="min-h-0 flex-1 overflow-hidden sm:p-6"
          >
            <App />
          </div>
          <Scrubber
            branch={branch}
            shown={shown}
            frame={runtime.frame}
            onShow={show}
          />
        </main>
        {inspecting && !narrow && (
          <aside className="flex w-80 shrink-0 flex-col border-l">
            {messages}
          </aside>
        )}
      </div>
      <Sheet open={inspecting && narrow} onOpenChange={setInspecting}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 rounded-t-xl p-0 data-[side=bottom]:h-[70dvh]"
        >
          <SheetTitle className="sr-only">Messages</SheetTitle>
          {messages}
        </SheetContent>
      </Sheet>
    </div>
  );
};

/**
 * Space anywhere switches Live and Replay, unless the user is typing or the
 * app already used the key (a menu or listbox choosing with Space).
 */
const useSpace = (toggle: () => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.matches('input:not([type=range]), textarea, select')
      )
        return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
};

const NARROW = '(max-width: 767px)';

/** Whether the screen is phone-sized, where the Messages open from the bottom. */
const useNarrow = () =>
  useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
