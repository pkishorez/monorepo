import type { useSidebar } from '@kstackz/use-gesture';
import { cn } from '@kstackz/ui-toolkit/utils';
import { motion } from 'motion/react';
import type { Boards } from './boards.ts';
import { COLUMNS } from './data.ts';

/** Its width in px. */
export const SIDEBAR_WIDTH = 280;

/** Every board, to switch to, over a scrim that shuts it. */
export function Sidebar(props: {
  readonly boards: Boards;
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly onSelect: (id: string) => void;
}) {
  const { boards, sidebar } = props;
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        aria-label="Boards"
        className="absolute inset-y-0 left-0 z-20 flex flex-col bg-sidebar pt-[max(0.75rem,env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] shadow-xl"
        style={{ width: SIDEBAR_WIDTH, x: sidebar.x }}
      >
        <p className="px-5 pt-3 pb-2 text-xs font-medium text-muted-foreground">
          Boards
        </p>
        <nav className="flex flex-col gap-0.5 px-2">
          {boards.boards.map((board) => {
            const count = COLUMNS.reduce(
              (sum, c) => sum + board.columns[c.id].length,
              0,
            );
            const active = board.id === boards.board.id;
            return (
              <button
                key={board.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-150',
                  active
                    ? 'bg-sidebar-accent font-medium'
                    : 'hover:bg-sidebar-accent/60',
                )}
                onClick={() => props.onSelect(board.id)}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: `oklch(0.65 0.15 ${board.hue})` }}
                />
                <span className="flex-1 truncate">{board.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </motion.aside>
    </>
  );
}
