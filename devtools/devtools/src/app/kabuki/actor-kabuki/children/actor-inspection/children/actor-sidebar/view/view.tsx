import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { tabOf } from '../logic/shared/index.js';
import type { SidebarShape, Tab } from '../logic/shared/index.js';

type BodyProps = ViewPropsOf<typeof SidebarShape> & {
  readonly world: ReactNode;
  readonly chat: ReactNode;
  readonly fakes: boolean;
};

const TABS: ReadonlyArray<{ readonly tab: Tab; readonly label: string }> = [
  { tab: 'world', label: 'World' },
  { tab: 'chat', label: 'Chat' },
];

const PANEL = 'min-h-0 flex-1 flex-col';

export function Body({ world, chat, fakes, ...self }: BodyProps) {
  const tab = tabOf(self, fakes);
  return (
    <aside
      aria-label="Beside the Inspector"
      className="flex h-[45%] shrink-0 flex-col border-t border-border/50 md:h-auto md:w-[22rem] md:border-t-0 md:border-l"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-border/50 px-3">
        {fakes ? (
          <div
            role="group"
            aria-label="Show"
            className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5"
          >
            {TABS.map(({ tab: one, label }) => (
              <button
                key={one}
                type="button"
                aria-pressed={one === tab}
                onClick={() => self.send({ _tag: 'Tabbed', tab: one })}
                className={cn(
                  'h-6 rounded-[5px] px-2.5 text-xs text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  one === tab &&
                    'bg-background font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="text-xs font-medium text-foreground">Chat</h2>
        )}
      </div>
      <div className={cn(PANEL, tab === 'world' ? 'flex' : 'hidden')}>
        {world}
      </div>
      <div className={cn(PANEL, tab === 'chat' ? 'flex' : 'hidden')}>
        {chat}
      </div>
    </aside>
  );
}
