import type { ReactNode } from 'react';
import { ListTree, Play, RotateCcw, Square } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';

/**
 * The demo menu on the left; Stop or Start, Restart, Messages and
 * Live | Replay on the right. Start while an entry is shown starts from it, a
 * new Branch. On a phone the buttons keep their icons and lose their words.
 */
export const TopBar = ({
  menu,
  running,
  forking,
  onStop,
  onStart,
  replaying,
  onLive,
  onReplay,
  onRestart,
  messages,
  inspecting,
  onInspect,
}: {
  readonly menu: ReactNode;
  readonly running: boolean;
  /** Whether Start would grow a new Branch from the entry shown. */
  readonly forking: boolean;
  readonly onStop: () => void;
  readonly onStart: () => void;
  readonly replaying: boolean;
  readonly onLive: () => void;
  readonly onReplay: () => void;
  readonly onRestart: () => void;
  readonly messages: number;
  readonly inspecting: boolean;
  readonly onInspect: () => void;
}) => (
  <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2 sm:px-3">
    <div className="min-w-0 flex-1">{menu}</div>
    {running && !forking ? (
      <Button size="sm" variant="ghost" aria-label="Stop" onClick={onStop}>
        <Square />
        <span className="max-sm:hidden">Stop</span>
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        aria-label={forking ? 'Start from here' : 'Start'}
        onClick={onStart}
      >
        <Play />
        <span className="max-sm:hidden">
          {forking ? 'Start from here' : 'Start'}
        </span>
      </Button>
    )}
    <Button size="sm" variant="ghost" aria-label="Restart" onClick={onRestart}>
      <RotateCcw />
      <span className="max-sm:hidden">Restart</span>
    </Button>
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Messages, ${messages}`}
      aria-pressed={inspecting}
      className="aria-pressed:bg-muted"
      onClick={onInspect}
    >
      <ListTree />
      <span className="max-sm:hidden">Messages</span>
      <span className="text-muted-foreground tabular-nums">{messages}</span>
    </Button>
    <div className="ml-1 flex items-center gap-2 sm:ml-2">
      <div
        role="group"
        aria-label="Mode"
        className="flex rounded-md border p-0.5"
      >
        <Mode on={!replaying} onClick={onLive}>
          Live
        </Mode>
        <Mode on={replaying} onClick={onReplay}>
          Replay
        </Mode>
      </div>
      <Kbd className="max-sm:hidden">Space</Kbd>
    </div>
  </header>
);

const Mode = ({
  on,
  onClick,
  children,
}: {
  readonly on: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className="h-7 rounded-[calc(var(--radius-md)-2px)] px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground"
  >
    {children}
  </button>
);
