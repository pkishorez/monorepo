import type { Pointer } from '@kstackz/use-gesture';
import { motion } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useEffect } from 'react';
import {
  fingerName,
  type Run,
  type Stray,
  useLab,
  useLabStore,
  zoneTagOf,
} from './store.ts';

// Why no Gesture took a finger that landed on the stage.
const whyIgnored = (target: Element) => {
  if (target.closest('[data-zone-gesture="disabled"]') !== null) {
    return 'it landed on an element marked data-zone-gesture="disabled"';
  }
  if (target.closest('[data-slot="gesture-zone"]') === null) {
    return 'it landed outside every zone with no Gesture to join';
  }
  return 'no enabled hook took it, or the browser owns this touch';
};

/**
 * Notices fingers that land on the stage and that no Gesture took, so the
 * overlay can show them too. It listens on the document, which hears a
 * pointer after the providers' window listeners have taken it or not.
 */
export function useStrays() {
  const store = useLabStore();
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-lab-stage]') == null) return;
      const taken = [...store.get().runs.values()].some(
        (run) =>
          run.state === 'active' &&
          run.pointers.has(event.pointerId) &&
          run.pointers.get(event.pointerId)?.end === undefined,
      );
      if (taken) return;
      store.stray(
        event.pointerId,
        event.clientX,
        event.clientY,
        whyIgnored(target),
      );
    };
    const move = (event: PointerEvent) =>
      store.moveStray(event.pointerId, event.clientX, event.clientY);
    const up = (event: PointerEvent) => store.liftStray(event.pointerId);
    const options = { capture: true };
    document.addEventListener('pointerdown', down, options);
    document.addEventListener('pointermove', move, options);
    document.addEventListener('pointerup', up, options);
    document.addEventListener('pointercancel', up, options);
    return () => {
      document.removeEventListener('pointerdown', down, options);
      document.removeEventListener('pointermove', move, options);
      document.removeEventListener('pointerup', up, options);
      document.removeEventListener('pointercancel', up, options);
    };
  }, [store]);
}

// The line from where a finger landed to where it is, and a dot where it landed.
function Trail(props: { readonly pointer: Pointer; readonly color: string }) {
  const { pointer, color } = props;
  return (
    <g>
      <motion.line
        x1={pointer.start.x}
        y1={pointer.start.y}
        x2={pointer.x}
        y2={pointer.y}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={pointer.end === undefined ? undefined : '4 6'}
      />
      <circle
        cx={pointer.start.x}
        cy={pointer.start.y}
        r={5}
        fill={color}
        stroke="var(--background)"
        strokeWidth={2}
      />
    </g>
  );
}

/**
 * A finger: numbered in landing order and filled with the color of the zone
 * it landed in, or hollow and dashed outside every zone. The first finger,
 * which decided who hears the Gesture, has a double ring. A lifted finger
 * turns into an outline and stays, frozen, until the Gesture ends.
 */
function Finger(props: { readonly run: Run; readonly pointer: Pointer }) {
  const { run, pointer } = props;
  const zone = zoneTagOf(pointer.target);
  const color = zone?.color ?? 'var(--foreground)';
  const first = [...run.pointers.keys()][0] === pointer.id;
  const lifted = pointer.end !== undefined;
  return (
    <motion.div
      style={{
        x: pointer.x,
        y: pointer.y,
        borderColor: color,
        outlineColor: color,
        backgroundColor: zone !== undefined && !lifted ? zone.color : undefined,
      }}
      data-finger={fingerName(run, pointer)}
      className={cn(
        'absolute top-0 left-0 -mt-6 -ml-6 flex size-12 items-center justify-center rounded-full border-[3px] font-mono text-base font-bold shadow-lg',
        zone === undefined && 'border-dashed bg-background text-foreground',
        zone !== undefined && !lifted && 'text-white',
        lifted && 'bg-background/70 text-foreground',
        first && 'outline-2 outline-offset-[3px]',
      )}
    >
      {fingerName(run, pointer)}
      {lifted ? (
        <span className="absolute -bottom-5 rounded bg-background px-1 text-[10px] font-medium text-muted-foreground">
          lifted
        </span>
      ) : null}
    </motion.div>
  );
}

function StrayMark(props: { readonly stray: Stray }) {
  return (
    <motion.div
      style={{ x: props.stray.x, y: props.stray.y }}
      className="absolute top-0 left-0 -mt-6 -ml-6 flex size-12 items-center justify-center rounded-full border-[3px] border-dashed border-muted-foreground/70 bg-muted/60 font-mono text-lg text-muted-foreground"
    >
      ×
    </motion.div>
  );
}

/**
 * Every finger on the screen, over everything and never in the way: those
 * of each provider's latest Gesture, faded once it ended, and those no
 * Gesture took.
 */
export function Overlay() {
  const { runs, strays } = useLab();
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {[...runs.values()].map((run) => (
        <div
          key={run.key}
          className={cn(
            'absolute inset-0 transition-opacity duration-300',
            run.state !== 'active' && 'opacity-40',
          )}
        >
          <svg className="absolute inset-0 size-full">
            {[...run.pointers.values()].map((pointer) => (
              <Trail
                key={pointer.id}
                pointer={pointer}
                color={zoneTagOf(pointer.target)?.color ?? 'var(--foreground)'}
              />
            ))}
          </svg>
          {[...run.pointers.values()].map((pointer) => (
            <Finger key={pointer.id} run={run} pointer={pointer} />
          ))}
        </div>
      ))}
      {strays.map((stray) => (
        <StrayMark key={stray.id} stray={stray} />
      ))}
    </div>
  );
}
