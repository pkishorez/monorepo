import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Instance } from '@kestack/kabuki';
import { INK } from '../ink/index.ts';
import type {
  Beats,
  Placed,
  WorkerKey,
  WorkerRow,
  WorkerStatus,
} from '../scene/index.ts';
import { CARD } from '../scene/index.ts';
import { Beat } from './beat/index.ts';
import { Link, Via } from './link/index.ts';
import { Node } from './node/index.ts';
import { Popup } from './popup/index.ts';

/*
 * The Map's words, one at a time: a card in every condition it can be in,
 * its States and its Workers, the Popup, a Link with what leads down it, and
 * each Beat, in the light Theme and the dark one side by side.
 */

const noop = () => {};

const instance = (key?: string, state = 'Filled'): Instance => ({
  id: key ? `Shop/items[${key}]#1` : 'Shop/cart#1',
  actor: 'Cart',
  ...(key ? { key } : {}),
  state: { _tag: state },
  model: {},
  children: {},
  invoked: {},
});

const keys = (
  ...statuses: ReadonlyArray<WorkerStatus>
): ReadonlyArray<WorkerKey> =>
  statuses.map((status, index) => ({
    id: `w${index}`,
    key: statuses.length === 1 ? '' : `file-${index + 1}`,
    instance: instance(),
    status,
  }));

/** A card as the Scene would give it, its height worked out the way the Scene works it out. */
const card = ({
  name = 'Cart',
  many = false,
  instances = [instance()],
  states = [['Empty', 'Filled'], ['Checkout']],
  workers = [],
}: {
  readonly name?: string;
  readonly many?: boolean;
  readonly instances?: ReadonlyArray<Instance>;
  /** Its States, in the lines the Scene would wrap them into. */
  readonly states?: ReadonlyArray<ReadonlyArray<string>> | null;
  readonly workers?: ReadonlyArray<WorkerRow>;
} = {}): Placed => {
  const width = Math.min(
    CARD.max,
    Math.max(CARD.min, 24 + name.length * 7.4 + (many ? 92 : 0) + CARD.pad * 2),
  );
  const lines = states ?? [];
  return {
    id: name,
    name,
    many,
    instances,
    ...(many && instances[0] ? { chosen: instances[0] } : {}),
    ...(states
      ? {
          states: lines.map((line) =>
            line.map((tag) => ({
              tag,
              count: instances.filter((each) => each.state._tag === tag).length,
            })),
          ),
        }
      : {}),
    workers,
    width,
    height:
      CARD.pad * 2 +
      CARD.header +
      (lines.length ? CARD.gap + lines.length * CARD.line : 0) +
      (workers.length ? CARD.gap + workers.length * CARD.row : 0),
    x: 0,
    y: 0,
    depth: 0,
    lit: instances.length > 0,
  };
};

const draw = (node: Placed, sentBy?: string) => (
  <Node
    node={node}
    picked={false}
    part={undefined}
    sentBy={sentBy}
    onPick={noop}
  />
);

interface Specimen {
  readonly label: string;
  readonly note: string;
  readonly draw: ReactNode;
}

/** Each specimen on a cell of its own, in both Themes. */
function Specimens({ items }: { readonly items: ReadonlyArray<Specimen> }) {
  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          className="bg-background text-foreground flex flex-col gap-4 p-6"
          style={INK}
        >
          <p className="text-muted-foreground text-[10.5px] font-medium tracking-wider uppercase">
            {theme}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {items.map((item) => (
              <figure
                key={item.label}
                className="flex flex-col overflow-hidden rounded-xl border"
              >
                <div className="relative h-52 p-5">
                  <div className="relative">{item.draw}</div>
                </div>
                <figcaption className="bg-muted/40 flex-1 border-t px-3 py-2">
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-muted-foreground text-[11px] leading-snug text-pretty">
                    {item.note}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const items = ['tea', 'cup', 'pot', 'jar-1', 'jar-2'].map((key, index) =>
  instance(key, index === 1 ? 'Saving' : 'Idle'),
);

const beats = (extra: Partial<Beats>): Beats => ({
  key: `${Math.random()}`,
  tag: 'Put',
  payload: { item: 'cup' },
  at: 840,
  source: { kind: 'view', instance: 'cart' },
  to: 'cart',
  send: { at: 'cart', by: 'View' },
  request: undefined,
  commands: [],
  ...extra,
});

/** A Beat beside a small card, played again each time it is tapped. */
function Replaying({ of }: { readonly of: Partial<Beats> }) {
  const [round, setRound] = useState(0);
  const played = beats({ ...of, key: `${round}` });
  const small = card({ states: null });
  return (
    <div onClick={() => setRound(round + 1)}>
      {played.request && (
        <div className="absolute">
          {draw(card({ name: 'Shop', states: null }))}
        </div>
      )}
      <div
        className="absolute"
        style={{ transform: `translateY(${played.request ? 90 : 0}px)` }}
      >
        {draw(small)}
      </div>
      <Beat
        beats={played}
        where={(id) =>
          id === 'shop' && played.request
            ? card({ name: 'Shop', states: null })
            : { ...small, y: played.request ? 90 : 0 }
        }
        onPick={noop}
      />
    </div>
  );
}

export default {
  Card: (
    <Specimens
      items={[
        {
          label: 'Running',
          note: 'An Instance runs here. Its States are options: the one it is in is filled.',
          draw: draw(card()),
        },
        {
          label: 'Not running',
          note: 'The Actor could run here: dashed, everything on it dim.',
          draw: draw(card({ instances: [] })),
        },
        {
          label: 'No States',
          note: 'An Actor without States is just its name.',
          draw: draw(card({ name: 'Notice', states: null })),
        },
        {
          label: 'Keyed Children',
          note: 'Many Instances in one place: a stack, how many in the corner, how many in each State, and a bar of how they split.',
          draw: draw(
            card({
              name: 'Item',
              many: true,
              instances: items,
              states: [['Idle', 'Saving']],
            }),
          ),
        },
      ]}
    />
  ),
  Workers: (
    <Specimens
      items={[
        {
          label: 'Live',
          note: 'One row per Worker it has, always there. One dot per key: breathing while it runs, red where it failed, quiet where it finished.',
          draw: draw(
            card({
              name: 'Catalog',
              states: null,
              workers: [
                { name: 'thumb', keys: keys('running', 'running', 'failed') },
                { name: 'sync', keys: keys('finished') },
              ],
            }),
          ),
        },
        {
          label: 'A past Step',
          note: 'Away from the live app, a dot says only that its key is on.',
          draw: draw(
            card({
              name: 'Catalog',
              states: null,
              workers: [{ name: 'thumb', keys: keys('on', 'on', 'on') }],
            }),
          ),
        },
        {
          label: 'Off',
          note: 'A Worker with no key running now reads off, but its row stays.',
          draw: draw(
            card({
              name: 'Shop',
              states: [['Loading', 'Open'], ['Closed']],
              instances: [instance(undefined, 'Open')],
              workers: [{ name: 'fetch', state: 'Loading', keys: [] }],
            }),
          ),
        },
        {
          label: 'Sent the Message',
          note: 'The Worker that Sent the Step’s Message has its row lit, even once its key ended.',
          draw: draw(
            card({
              name: 'Shop',
              states: [['Loading', 'Open'], ['Closed']],
              instances: [instance(undefined, 'Open')],
              workers: [{ name: 'fetch', state: 'Loading', keys: [] }],
            }),
            'fetch',
          ),
        },
      ]}
    />
  ),
  Popup: (
    <Specimens
      items={[
        {
          label: 'Instances',
          note: 'A picked place of keyed Children lists its Instances beside it: by key, with the State each is in.',
          draw: (
            <Popup
              name="Item"
              instances={items}
              picked="Shop/items[cup]#1"
              onPick={noop}
            />
          ),
        },
      ]}
    />
  ),
  Link: (
    <Specimens
      items={[
        {
          label: 'Led by a State',
          note: 'The State that Invokes what is below, on its line: filled while an Instance is in it.',
          draw: (
            <>
              <svg className="absolute overflow-visible" width={1} height={1}>
                <Link d="M 40 0 V 40 H 160 V 90" lit />
              </svg>
              <Via text="Open" x={160} y={66} align="middle" lit />
            </>
          ),
        },
        {
          label: 'Not lit',
          note: 'Dashed: nothing runs below, or its State is not the one the Instance is in.',
          draw: (
            <>
              <svg className="absolute overflow-visible" width={1} height={1}>
                <Link d="M 40 0 V 40 H 160 V 90" lit={false} />
              </svg>
              <Via text="Closed" x={160} y={66} align="middle" lit={false} />
            </>
          ),
        },
      ]}
    />
  ),
  Beat: (
    <Specimens
      items={[
        {
          label: 'Send',
          note: 'Who Sent it, and its tag beside the card it went to. Tap to play again.',
          draw: <Replaying of={{}} />,
        },
        {
          label: 'Request',
          note: 'A card asks the one that Provides, up the tree.',
          draw: (
            <Replaying
              of={{
                tag: 'Close',
                to: 'shop',
                send: { at: 'cart', by: 'pay' },
                request: { from: 'cart', to: 'shop' },
                source: { kind: 'worker', instance: 'cart', name: 'pay' },
              }}
            />
          ),
        },
        {
          label: 'Command',
          note: 'The Commands its Update asked for, under its tag.',
          draw: (
            <Replaying
              of={{ commands: [{ name: 'track', args: { count: 1 } }] }}
            />
          ),
        },
      ]}
    />
  ),
};
