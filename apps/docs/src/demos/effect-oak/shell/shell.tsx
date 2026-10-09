import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { Entry } from 'effect-oak';
import type { TimeTravel } from 'effect-oak/react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@kstackz/web-platform/components/sheet';
import { Messages } from './messages.js';
import { Scrubber } from './scrubber.js';
import { TopBar } from './top-bar.js';

/** An app made with `toReact`: what the shell runs and inspects. */
type OakApp = ComponentType & {
  readonly useLog: () => ReadonlyArray<Entry>;
  readonly useTimeTravel: () => TimeTravel;
};

/*
 * The frame every Effect Oak demo runs in. The app fills the middle, Live or
 * in Replay. Replay stops its Time so the timeline below can move through it;
 * Live carries on from where it stopped. Space switches between them. Once
 * the app is over there is nothing live left to go back to: it stays in
 * Replay. The Messages open beside it, or from the bottom on a phone.
 */
export const Shell = ({
  app: App,
  menu,
  over = false,
}: {
  readonly app: OakApp;
  /** Where the demo's name goes: a menu to go home or to another demo. */
  readonly menu: ReactNode;
  /** The app has ended: only Replay is left. */
  readonly over?: boolean;
}) => {
  const [run, setRun] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const narrow = useNarrow();
  const time = App.useTimeTravel();
  const log = App.useLog();

  useEffect(() => {
    if (over) time.pause();
  }, [over, time.pause]);
  useSpace(over ? () => {} : time.paused ? time.resume : time.pause);

  const messages = (
    <Messages log={log} time={time} onClose={() => setInspecting(false)} />
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TopBar
        menu={menu}
        replaying={time.paused}
        over={over}
        onLive={time.resume}
        onReplay={time.pause}
        onRestart={() => setRun((n) => n + 1)}
        messages={log.length}
        inspecting={inspecting}
        onInspect={() => setInspecting((open) => !open)}
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            inert={time.paused}
            className="min-h-0 flex-1 overflow-hidden sm:p-6"
          >
            <App key={run} />
          </div>
          <Scrubber time={time} />
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
