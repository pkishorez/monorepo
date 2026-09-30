import { type MotionValue, motion, useTransform } from 'motion/react';
import { TABS } from './data.ts';
import type { Pager } from './pager.ts';

/** The tabs, with an underline that follows the finger as the pages move. */
export function TabStrip(props: { readonly pager: Pager }) {
  const { pager } = props;
  const x = useTransform(pager.progress, (p) => `${p * 100}%`);
  return (
    <nav className="relative flex border-b border-border" aria-label="Sections">
      {TABS.map((tab, i) => (
        <Tab
          key={tab.id}
          title={tab.title}
          index={i}
          progress={pager.progress}
          current={pager.page === i}
          onClick={() => pager.goTo(i)}
        />
      ))}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 flex w-1/5 justify-center"
        style={{ x }}
      >
        <div className="h-0.5 w-8 rounded-full bg-foreground" />
      </motion.div>
    </nav>
  );
}

function Tab(props: {
  readonly title: string;
  readonly index: number;
  readonly progress: MotionValue<number>;
  readonly current: boolean;
  readonly onClick: () => void;
}) {
  const { index } = props;
  const opacity = useTransform(
    props.progress,
    [index - 1, index, index + 1],
    [0.55, 1, 0.55],
  );
  return (
    <motion.button
      type="button"
      aria-current={props.current ? 'page' : undefined}
      className="min-h-11 flex-1 text-sm font-medium"
      style={{ opacity }}
      onClick={props.onClick}
    >
      {props.title}
    </motion.button>
  );
}
