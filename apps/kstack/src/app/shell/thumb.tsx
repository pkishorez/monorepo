import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Plus,
} from '@kstackz/ui-toolkit/lucide';
import type { ReactNode } from 'react';
import { keys, THUMB } from '../../commands/index.ts';
import { useMoney } from '../../client/data/index.ts';
import { play } from '../../kit/sound/index.ts';
import {
  type ThumbCommand,
  type ThumbFeedback,
  ThumbLock,
  type Way,
} from '../../kit/thumb-lock/index.ts';

const ICONS: Readonly<Record<Way, ReactNode>> = {
  down: <ArrowDownToLine className="size-3.5" />,
  up: <Plus className="size-3.5" />,
  left: <ChevronLeft className="size-3.5" />,
  right: <ChevronRight className="size-3.5" />,
};

// Short names for the arms; the Compass has little room.
const NAMES: Readonly<Record<Way, string>> = {
  down: 'Jump',
  up: 'Add',
  left: 'Next',
  right: 'Previous',
};

const buzz = (pattern: number | ReadonlyArray<number>) =>
  navigator.vibrate?.(pattern as number[]);

const FEEDBACK: Readonly<Record<ThumbFeedback, () => void>> = {
  lock: () => play('tick'),
  arm: () => {
    play('arm');
    buzz(8);
  },
  disarm: () => {},
  wrong: () => {
    play('wrong');
    buzz([14, 40, 14]);
  },
  // The Command announces itself as it runs.
  run: () => {},
};

/**
 * The Thumb Lock of every Place: each way runs the same Action as its key,
 * so an arm works exactly where the key would, and is dimmed where not.
 */
export function Thumb() {
  const { preferences } = useMoney();
  const { actions } = keys.useStatus();
  const run = keys.useRun();
  const works = (way: Way) =>
    actions.find((action) => action.id === THUMB[way])?.state === 'active';
  const commands = Object.fromEntries(
    (Object.keys(THUMB) as Way[]).map((way) => [
      way,
      { label: NAMES[way], icon: ICONS[way], works: works(way) },
    ]),
  ) as Record<Way, ThumbCommand>;

  return (
    <ThumbLock
      commands={commands}
      onCommand={(way) => run(THUMB[way])}
      onFeedback={(feedback) => FEEDBACK[feedback]()}
      enabled={preferences.gesturesOn !== false}
    />
  );
}
