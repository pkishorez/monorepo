import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { MenuIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone, useSidebar } from '@kstackz/use-gesture';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { appTheme } from '../../../common/theme.ts';
import { type Boards, useBoards } from './boards.ts';
import { Columns } from './columns.tsx';
import { COLUMNS } from './data.ts';
import { type Pager, usePager } from './pager.ts';
import { Sidebar, SIDEBAR_WIDTH } from './sidebar.tsx';

/**
 * A task board on a phone: columns that page sideways, cards that swipe to
 * the next column or lift to be carried, and boards in a sidebar that opens
 * from the left edge, since everywhere else a sideways swipe is the board's.
 */
export function BoardApp() {
  return (
    <GestureZone className="fixed inset-0 flex flex-col bg-background">
      <appTheme.StatusBar />
      <Screen />
    </GestureZone>
  );
}

function Screen() {
  const boards = useBoards();
  const pager = usePager(COLUMNS.length);
  const sidebar = useSidebar({ side: 'left', width: SIDEBAR_WIDTH, edge: 24 });

  return (
    <>
      <header className="flex flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div className="flex h-14 items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Boards"
            className="size-11 md:size-9"
            onClick={() => sidebar.setOpen(true)}
          >
            <MenuIcon aria-hidden="true" />
          </Button>
          <h1 className="text-[15px] font-semibold tracking-tight">
            {boards.board.name}
          </h1>
        </div>
        {pager.pages === COLUMNS.length ? (
          <ColumnTabs boards={boards} pager={pager} />
        ) : null}
      </header>
      <Columns boards={boards} pager={pager} />
      <Sidebar
        boards={boards}
        sidebar={sidebar}
        onSelect={(id) => {
          boards.select(id);
          sidebar.setOpen(false);
          pager.goTo(0);
        }}
      />
    </>
  );
}

/** On a phone, where one column shows at a time: every column and its count, the one in view underlined. */
function ColumnTabs(props: { readonly boards: Boards; readonly pager: Pager }) {
  const { pager } = props;
  return (
    <nav className="relative flex px-3" aria-label="Columns">
      {COLUMNS.map((column, i) => (
        <button
          key={column.id}
          type="button"
          aria-current={pager.page === i ? 'true' : undefined}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 aria-[current]:text-foreground"
          onClick={() => pager.goTo(i)}
        >
          {column.title}
          <span className="text-xs text-muted-foreground tabular-nums">
            {props.boards.board.columns[column.id].length}
          </span>
        </button>
      ))}
      <Underline x={pager.x} stops={pager.stops} />
    </nav>
  );
}

function Underline(props: {
  readonly x: MotionValue<number>;
  readonly stops: ReadonlyArray<number>;
}) {
  const x = useTransform(
    props.x,
    [...props.stops].reverse(),
    props.stops.map((_, i) => `${(props.stops.length - 1 - i) * 100}%`),
  );
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-0">
      <motion.div className="flex w-1/4 justify-center" style={{ x }}>
        <div className="h-0.5 w-10 rounded-full bg-foreground" />
      </motion.div>
    </div>
  );
}
