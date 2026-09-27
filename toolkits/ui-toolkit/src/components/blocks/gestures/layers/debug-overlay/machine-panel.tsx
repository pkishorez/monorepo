import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '#lib/utils';
import {
  layoutStateMachine,
  serializeV5,
  StateMachineSvg,
} from '../../../state-machine-visualizer';
import { gestureMachine } from '../../engine';
import type { ZoneSource } from '../../provider';

type Diagram = Awaited<ReturnType<typeof layoutStateMachine>>;
type Highlights = NonNullable<
  Parameters<typeof StateMachineSvg>[0]['nodeHighlights']
>;
type Highlight = Highlights extends ReadonlyMap<string, infer H> ? H : never;
type StateValue = string | { readonly [key: string]: StateValue };

// Diagram units to CSS pixels: small, but every label still reads.
const SCALE = 0.45;

// Laid out once per page: the machine never changes.
let diagram: Promise<Diagram> | undefined;
const loadDiagram = () =>
  (diagram ??= layoutStateMachine(serializeV5(gestureMachine)));

const IDLE = JSON.stringify('idle');

/** `{ held: 'moving' }` as `['held', 'moving']`. */
const leafPath = (value: StateValue): ReadonlyArray<string> => {
  if (typeof value === 'string') return [value];
  const [key, child] = Object.entries(value)[0] ?? [];
  return key === undefined || child === undefined
    ? []
    : [key, ...leafPath(child)];
};

const FOCUSED: Highlight = { kind: 'focused' };
const CONNECTED: Highlight = { kind: 'connected', direction: 'outgoing' };
const DIMMED: Highlight = { kind: 'dimmed' };

/**
 * The gestures machine, drawn with the state machine visualizer and
 * following the state of the zone touched last: it is lit, the states it can go to next are
 * marked, the rest dimmed. Read only and never takes input, so it can sit
 * over anything.
 */
export function MachinePanel(props: {
  readonly source: ZoneSource;
  readonly className?: string;
}) {
  const { source } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const [laidOut, setLaidOut] = useState<Diagram>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // A string, so an unchanged state is the same snapshot.
  const state = useSyncExternalStore(
    source.subscribe,
    () => JSON.stringify(source.active()?.value ?? 'idle'),
    () => IDLE,
  );

  useEffect(() => {
    let live = true;
    void loadDiagram().then((result) => {
      if (live) setLaidOut(result);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => {
    if (laidOut === undefined) return undefined;
    const path = leafPath(JSON.parse(state) as StateValue).join('.');
    const active = laidOut.nodes.find(
      (node) => node.kind === 'state' && node.path?.join('.') === path,
    );
    const nodes = new Map<string, Highlight>();
    const edges = new Map<string, Highlight>();
    for (const edge of laidOut.edges) {
      if (edge.source !== active?.id) continue;
      edges.set(edge.id, CONNECTED);
      nodes.set(edge.target, CONNECTED);
    }
    for (const node of laidOut.nodes) {
      if (node.kind === 'state' && !node.container && !nodes.has(node.id)) {
        nodes.set(node.id, DIMMED);
      }
    }
    if (active !== undefined) nodes.set(active.id, FOCUSED);
    const width = size.width / SCALE;
    const height = size.height / SCALE;
    const center =
      active === undefined
        ? { x: laidOut.width / 2, y: laidOut.height / 2 }
        : { x: active.x + active.width / 2, y: active.y + active.height / 2 };
    return {
      nodes,
      edges,
      viewport: {
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      },
    };
  }, [laidOut, size, state]);

  return (
    <div
      ref={boxRef}
      data-testid="gesture-overlay-machine"
      data-state={state}
      className={cn(
        'pointer-events-none fixed overflow-hidden rounded-xl border border-border bg-background/85 backdrop-blur-sm',
        props.className,
      )}
    >
      {laidOut === undefined ||
      view === undefined ||
      size.width === 0 ? null : (
        <StateMachineSvg
          diagram={laidOut}
          viewport={view.viewport}
          nodeHighlights={view.nodes}
          edgeHighlights={view.edges}
        />
      )}
    </div>
  );
}
