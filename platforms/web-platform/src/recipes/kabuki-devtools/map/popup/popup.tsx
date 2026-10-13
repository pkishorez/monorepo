import { motion, useReducedMotion } from 'motion/react';
import type { Instance } from '@kstackz/kabuki';
import { cn } from '../../../../components/lib/utils.ts';
import { ink } from '../../ink/index.ts';

/*
 * The Popup: the Instances at a picked place of keyed Children, as a table
 * opened beside its card, over the Map, so the Map never moves to show it.
 * One row per Instance: its key, and the State it is in, drawn as the card
 * draws States. A row picks its Instance. It scrolls on its own.
 */

export function Popup({
  name,
  instances,
  picked,
  onPick,
}: {
  /** The Actor's name. */
  readonly name: string;
  readonly instances: ReadonlyArray<Instance>;
  /** The Instance picked. */
  readonly picked: string | undefined;
  readonly onPick: (instance: string) => void;
}) {
  const still = useReducedMotion();
  const stateful = instances.some((each) => each.state._tag !== 'Single');
  return (
    <motion.div
      className="bg-popover text-popover-foreground flex max-h-80 w-64 flex-col overflow-hidden rounded-lg border shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.12)]"
      initial={still ? false : { opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
    >
      <p className="border-b px-3 py-2 text-xs">
        <span className="font-semibold">{instances.length}</span>{' '}
        <span className="text-muted-foreground">{name} Instances, by key</span>
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        <span>Key</span>
        {stateful && <span>State</span>}
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-1 pb-1">
        {instances.map((instance) => (
          <button
            key={instance.id}
            type="button"
            onClick={() => onPick(instance.id)}
            aria-pressed={picked === instance.id}
            className={cn(
              'grid h-7 w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-md px-2 text-left text-xs transition-colors duration-100 outline-none',
              'hover:bg-muted focus-visible:bg-muted',
              picked === instance.id && 'bg-muted',
            )}
          >
            <span className="truncate font-mono">
              {instance.key ?? instance.id}
            </span>
            {stateful && (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: ink('active') }}
                />
                {instance.state._tag}
              </span>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
