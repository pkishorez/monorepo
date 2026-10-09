import type { ReactNode } from 'react';
import { ListTree, RotateCcw } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';

/**
 * The demo menu on the left; Restart, Messages and Live | Replay on the right.
 * On a phone the buttons keep their icons and lose their words.
 */
export const TopBar = ({
  menu,
  replaying,
  over,
  onLive,
  onReplay,
  onRestart,
  messages,
  inspecting,
  onInspect,
}: {
  readonly menu: ReactNode;
  readonly replaying: boolean;
  /** The app has ended, so Live is no longer there to go back to. */
  readonly over: boolean;
  readonly onLive: () => void;
  readonly onReplay: () => void;
  readonly onRestart: () => void;
  readonly messages: number;
  readonly inspecting: boolean;
  readonly onInspect: () => void;
}) => (
  <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2 sm:px-3">
    <div className="min-w-0 flex-1">{menu}</div>
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
        <Mode on={!replaying} disabled={over} onClick={onLive}>
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
  disabled,
  onClick,
  children,
}: {
  readonly on: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={on}
    disabled={disabled}
    onClick={onClick}
    className="h-7 rounded-[calc(var(--radius-md)-2px)] px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-muted aria-pressed:text-foreground"
  >
    {children}
  </button>
);
