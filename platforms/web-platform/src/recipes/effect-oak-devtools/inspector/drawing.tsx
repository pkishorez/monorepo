import { AnimatePresence, motion } from 'motion/react';
import type { Step } from '../step/index.ts';
import type { AppMap, Status } from './map/index.ts';
import { Circle, Many, Pill } from './nodes.tsx';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOVE = { duration: 0.35, ease: EASE_OUT } as const;

const STROKE: Record<Status, string> = {
  dim: 'stroke-muted-foreground/20',
  same: 'stroke-muted-foreground/60',
  changed: 'stroke-muted-foreground/60',
  started: 'stroke-positive',
  stopped: 'stroke-destructive/70',
};

const MARKERS = ['dim', 'same', 'started', 'stopped'] as const;
const markerOf = (status: Status) =>
  `url(#oak-arrow-${status === 'changed' ? 'same' : status})`;

/** The map: edges, then nodes, so nodes sit on top. */
export const Drawing = ({
  map,
  step,
  picked,
  onPick,
  onToggle,
}: {
  readonly map: AppMap;
  readonly step: Step;
  readonly picked: string | null;
  readonly onPick: (id: string) => void;
  readonly onToggle: (id: string) => void;
}) => {
  const entry = step === 'init' ? undefined : step;
  const stepKey = entry ? entry.id : 'init';
  const target = entry && map.at.get(entry.instance);
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={map.width}
        height={map.height}
      >
        <defs>
          {MARKERS.map((status) => (
            <marker
              key={status}
              id={`oak-arrow-${status}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0.5 L 7 4 L 0 7.5"
                fill="none"
                strokeWidth="1.5"
                className={STROKE[status]}
              />
            </marker>
          ))}
        </defs>
        <AnimatePresence>
          {map.edges.map((edge) => (
            <motion.path
              key={edge.id}
              initial={{ d: edge.d, opacity: 0 }}
              animate={{ d: edge.d, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={MOVE}
              fill="none"
              strokeWidth={edge.status === 'dim' ? 1 : 1.5}
              strokeDasharray={
                edge.status === 'dim' || edge.status === 'stopped'
                  ? '4 3'
                  : undefined
              }
              markerEnd={markerOf(edge.status)}
              className={`transition-[stroke] duration-300 ${STROKE[edge.status]}`}
            />
          ))}
          {map.request && (
            <motion.path
              key={`request-${stepKey}`}
              d={map.request}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              markerEnd="url(#oak-arrow-started)"
              className="stroke-primary"
            />
          )}
        </AnimatePresence>
      </svg>
      <AnimatePresence>
        {map.nodes.map((node) => {
          const message = node.id === target ? entry?.message._tag : undefined;
          return node.kind === 'actor' ? (
            <Circle
              key={node.id}
              node={node}
              stepKey={stepKey}
              message={message}
              picked={picked !== null && node.instance?.id === picked}
              onPick={() => node.instance && onPick(node.instance.id)}
            />
          ) : node.kind === 'many' ? (
            <Many
              key={node.id}
              node={node}
              stepKey={stepKey}
              message={message}
              onToggle={() => onToggle(node.id)}
            />
          ) : (
            <Pill key={node.id} node={node} />
          );
        })}
      </AnimatePresence>
    </>
  );
};
