import { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from 'motion/react';
import { ink } from '../ink/index.ts';
import { FOLD, STATE } from '../scene/index.ts';
import type { Placed, PlacedState, Scene } from '../scene/index.ts';
import { Beat } from './beat/index.ts';
import { Canvas, ITEM, OWN } from './canvas/index.ts';
import type { Bounds } from './canvas/index.ts';
import { Link, Via } from './link/index.ts';
import { Node } from './node/index.ts';
import type { Part } from './node/index.ts';
import { Popup } from './popup/index.ts';

/*
 * The Map: one Scene drawn on a Canvas. Cards move only when what hangs
 * below one changes: a Transition, or a fold.
 *
 * 1. Lines   under everything.
 * 2. Cards   one per place, its States and Workers on it; under it, a small
 *            node per State that starts something, the one it is in lit and
 *            holding what it starts, any other faded and naming it.
 * 3. Beats   over the cards, for each new Message.
 * 4. Focus   a picked card stays bright with its way up to the root and the
 *            cards right below it; the rest all but fades. A tap on the empty
 *            Map lets go.
 * 5. Popup   beside a picked place of keyed Children, its Instances, to pick
 *            one.
 * 6. Fold    a right click on a card folds what hangs below it into one
 *            row of names under it; a click on them, or another right
 *            click, unfolds it. What folds, or what a Transition stops,
 *            shrinks into what it hung from; what unfolds or starts grows
 *            out of it; the rest glides to its new place. Anything with
 *            nothing to fold shakes.
 */

/** What a pick is: a card, maybe a part of it or one of its Instances; or the Step's Message. */
export type Pick =
  | {
      readonly node: string;
      readonly part?: Part;
      readonly instance?: string;
    }
  | { readonly message: true };

/** How much of what is out of focus still shows. */
const FADED = 0.16;

/** A glide to a new place. */
const MOVE = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const;
/** Folding into a card. */
const FOLDING = { duration: 0.3, ease: [0.65, 0, 0.35, 1] } as const;

/** Anything placed on the Map: a card or a State node. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
type Spots = ReadonlyMap<string, Spot>;

/** What everything hung from, ever: what is gone still knows where it hung. */
type Parents = ReadonlyMap<string, string>;

/** What a node gone from the Map shrinks into, or one new to it grows out of: the nearest thing above it still on it. */
const anchorOf = (now: Spots, parents: Parents, id: string) => {
  for (let up = parents.get(id); up; up = parents.get(up)) {
    const spot = now.get(up);
    if (spot) return spot;
  }
  return undefined;
};

/** Where on the anchor a node shrinks to: the middle of its bottom edge. */
const tuck = (now: Spots, parents: Parents, id: string, spot: Spot) => {
  const anchor = anchorOf(now, parents, id);
  return anchor
    ? {
        x: anchor.x + anchor.width / 2 - spot.width / 2,
        y: anchor.y + anchor.height - spot.height / 2,
      }
    : { x: spot.x, y: spot.y };
};

/** A line drawn down to nothing at the anchor of what it leads to. */
const pinched = (now: Spots, parents: Parents, to: string) => {
  const anchor = anchorOf(now, parents, to);
  if (!anchor) return undefined;
  const x = anchor.x + anchor.width / 2;
  const y = anchor.y + anchor.height;
  return `M ${x} ${y} C ${x} ${y} ${x} ${y} ${x} ${y}`;
};

/** A no-op, shown: a short shake. */
const shake = (element: Element | null, still: boolean | null) => {
  if (!element) return;
  if (still) animate(element, { opacity: [1, 0.6, 1] }, { duration: 0.3 });
  else
    animate(
      element,
      { x: [0, -6, 6, -4, 4, -2, 0] },
      { duration: 0.42, ease: 'easeInOut' },
    );
};

const boundsOf = (scene: Scene): Bounds =>
  [...scene.nodes, ...scene.states].reduce(
    (bounds, node) => ({
      left: Math.min(bounds.left, node.x),
      right: Math.max(bounds.right, node.x + node.width),
      top: Math.min(bounds.top, node.y),
      bottom: Math.max(
        bounds.bottom,
        node.y +
          node.height +
          ('folded' in node && node.folded ? FOLD : 0) +
          ('names' in node && node.names ? STATE.names : 0),
      ),
    }),
    { left: 0, right: 0, top: 0, bottom: 0 },
  );

/** The card picked, its way up to the root, and the cards right below it, through its State nodes. */
const focusOf = (scene: Scene, parents: Parents, id: string | undefined) => {
  if (!id || !scene.at.has(id)) return undefined;
  const lit = new Set<string>([id]);
  for (let up = parents.get(id); up; up = parents.get(up)) lit.add(up);
  const below = (of: string) =>
    [...scene.nodes, ...scene.states].filter(
      (each) => parents.get(each.id) === of,
    );
  for (const child of below(id)) {
    lit.add(child.id);
    if (!scene.at.has(child.id))
      for (const grand of below(child.id)) lit.add(grand.id);
  }
  return lit;
};

export function AppMap({
  scene,
  picked,
  onPick,
  onChoose,
  onFold,
  dotted,
}: {
  readonly scene: Scene;
  readonly picked: Pick | undefined;
  readonly onPick: (pick: Pick | undefined) => void;
  /** Show another Instance at a place of many. */
  readonly onChoose: (place: string, instance: string) => void;
  /** Fold or unfold what hangs below a card. */
  readonly onFold: (place: string) => void;
  /** Dots under the Map. On by default. */
  readonly dotted?: boolean;
}) {
  const hasBelow = new Set(scene.lines.map((line) => line.from));
  const { at, beats } = scene;
  const still = useReducedMotion();
  const pickedNode = picked && 'node' in picked ? picked : undefined;

  // Where everything is now, and what everything ever hung from.
  const spots: Spots = new Map<string, Spot>(
    [...scene.nodes, ...scene.states].map((each) => [each.id, each]),
  );
  const parents = useRef(new Map<string, string>()).current;
  for (const node of scene.nodes)
    if (node.parent) parents.set(node.id, node.parent);
  for (const state of scene.states) parents.set(state.id, state.owner);

  // 4. Focus
  const focus = focusOf(scene, parents, pickedNode?.node);
  const shows = (id: string | undefined) =>
    !focus || (id !== undefined && focus.has(id)) ? 1 : FADED;

  // 5. Popup
  const holder = pickedNode ? at.get(pickedNode.node) : undefined;
  const popup =
    holder?.many && holder.instances.length > 0 ? holder : undefined;

  return (
    <Canvas
      bounds={boundsOf(scene)}
      label="Map of the app"
      onTap={() => onPick(undefined)}
      {...(dotted === undefined ? {} : { dotted })}
    >
      {/* 1. Lines */}
      <svg
        className="absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden
      >
        <AnimatePresence custom={spots} initial={false}>
          {scene.lines.map((line) => (
            <Link
              key={line.id}
              d={line.d}
              lit={line.lit}
              shown={Math.min(shows(line.from), shows(line.to))}
              from={(now) => pinched(now as Spots, parents, line.to)}
              custom={spots}
              still={still}
            />
          ))}
        </AnimatePresence>
      </svg>
      <AnimatePresence initial={false}>
        {scene.labels.map((label) => (
          <motion.div
            key={label.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: still ? 0 : 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <Via {...label} shown={shows(label.owner)} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 2. Cards */}
      <AnimatePresence custom={spots} initial={false}>
        {scene.states.map((state) => (
          <motion.div
            {...ITEM}
            key={state.id}
            className="absolute top-0 left-0"
            custom={spots}
            variants={{
              away: (now: Spots) => ({
                ...tuck(now, parents, state.id, state),
                opacity: 0,
                scale: 0.6,
                transition: still ? { duration: 0 } : FOLDING,
              }),
              here: {
                x: state.x,
                y: state.y,
                opacity: shows(state.id),
                scale: 1,
                transition: still ? { duration: 0 } : MOVE,
              },
            }}
            initial="away"
            animate="here"
            exit="away"
            onContextMenu={(event) =>
              shake(event.currentTarget.firstElementChild, still)
            }
          >
            <StateNode state={state} />
          </motion.div>
        ))}
        {scene.nodes.map((node) => {
          const isPicked = pickedNode?.node === node.id;
          return (
            <motion.div
              {...ITEM}
              key={node.id}
              className="absolute top-0 left-0"
              custom={spots}
              variants={{
                away: (now: Spots) => ({
                  ...tuck(now, parents, node.id, node),
                  opacity: 0,
                  scale: 0.6,
                  transition: still ? { duration: 0 } : FOLDING,
                }),
                here: {
                  x: node.x,
                  y: node.y,
                  opacity: shows(node.id),
                  scale: 1,
                  transition: still ? { duration: 0 } : MOVE,
                },
              }}
              initial="away"
              animate="here"
              exit="away"
              onContextMenu={(event) => {
                event.preventDefault();
                if (node.folded || hasBelow.has(node.id)) onFold(node.id);
                else
                  shake(
                    event.currentTarget.querySelector('[data-shake]'),
                    still,
                  );
              }}
              style={{ zIndex: isPicked ? 10 : undefined }}
            >
              <AnimatePresence>
                {node.folded && (
                  <motion.div
                    key="folded"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: still ? 0 : 0.22, duration: 0.2 },
                    }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    <Folded
                      folded={node.folded}
                      width={node.width}
                      top={node.height}
                      onUnfold={() => onFold(node.id)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <div data-shake>
                <Node
                  node={node}
                  picked={isPicked}
                  part={isPicked ? pickedNode?.part : undefined}
                  got={beats?.to === node.id}
                  onChoose={(instance) => onChoose(node.id, instance)}
                  sentBy={
                    beats?.send?.at === node.id ? beats.send.worker : undefined
                  }
                  onPick={(part) =>
                    onPick(
                      part === null
                        ? undefined
                        : { node: node.id, ...(part ? { part } : {}) },
                    )
                  }
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 3. Beats, over every card, the picked one too */}
      {beats && beats.to !== popup?.id && (
        <div
          {...ITEM}
          className="absolute top-0 left-0 z-20"
          style={{
            opacity: Math.max(shows(beats.to), shows(beats.send?.at)),
            transition: 'opacity 150ms ease',
          }}
        >
          <Beat
            key={beats.key}
            beats={beats}
            where={(id) => at.get(id)}
            onPick={() => onPick({ message: true })}
          />
        </div>
      )}

      {/* 5. Popup */}
      {popup && (
        <div
          {...OWN}
          {...ITEM}
          key={popup.id}
          className="absolute top-0 left-0 z-30"
          style={{
            transform: `translate(${popup.x + popup.width + 12}px, ${popup.y}px)`,
          }}
        >
          <Popup
            name={popup.name}
            instances={popup.instances}
            picked={pickedNode?.instance}
            onPick={(instance) => {
              onChoose(popup.id, instance);
              onPick({ node: popup.id, instance });
            }}
          />
        </div>
      )}
    </Canvas>
  );
}

/** What a folded card hides, named under it: one click unfolds it. */
function Folded({
  folded,
  width,
  top,
  onUnfold,
}: {
  readonly folded: NonNullable<Placed['folded']>;
  readonly width: number;
  readonly top: number;
  readonly onUnfold: () => void;
}) {
  const shown = folded.names.slice(0, 3);
  const more = folded.hidden - shown.length;
  return (
    <button
      type="button"
      onClick={onUnfold}
      title="Unfold"
      className="text-muted-foreground hover:text-foreground absolute flex items-center justify-center gap-1 text-[11px] transition-colors duration-150 outline-none focus-visible:ring-2"
      style={{ top: top + 8, left: 0, width }}
    >
      <ChevronDown className="size-3 shrink-0" />
      {shown.map((name, index) => (
        <span
          key={`${name}-${index}`}
          className="bg-background max-w-20 truncate rounded-md border border-dashed px-1.5 py-0.5"
        >
          {name}
        </span>
      ))}
      {more > 0 && <span className="shrink-0 tabular-nums">+{more}</span>}
    </button>
  );
}

/** One State of a card that starts something: lit and holding what it starts while the card is in it; faded and naming it otherwise. */
function StateNode({ state }: { readonly state: PlacedState }) {
  return (
    <div style={{ width: state.width }}>
      <div
        className="flex items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11.5px] whitespace-nowrap transition-[color,border-color,box-shadow,background-color] duration-200"
        style={{
          height: STATE.height,
          ...(state.lit
            ? {
                backgroundColor: ink('active-soft'),
                borderColor: `color-mix(in oklch, ${ink('active')} 45%, transparent)`,
                color: ink('lit'),
                boxShadow:
                  '0 1px 2px rgb(0 0 0 / 0.06), 0 4px 10px rgb(0 0 0 / 0.06)',
              }
            : {
                borderStyle: 'dashed',
                borderColor: ink('dim'),
                color: ink('dim'),
              }),
        }}
        title={
          state.active
            ? `In ${state.tag}: what hangs below runs`
            : `Not in ${state.tag}: it would start ${state.names?.join(', ')}`
        }
      >
        <span
          className="size-1.5 shrink-0 rounded-full border"
          style={{
            borderColor: state.lit ? ink('active') : ink('dim'),
            backgroundColor: state.lit ? ink('active') : 'transparent',
          }}
        />
        <span className={state.lit ? 'font-medium' : undefined}>
          {state.tag}
        </span>
      </div>
      {state.names && (
        <p
          className="truncate text-center text-[10.5px]"
          style={{ color: ink('dim'), lineHeight: `${STATE.names}px` }}
        >
          {state.names.join(', ')}
        </p>
      )}
    </div>
  );
}
