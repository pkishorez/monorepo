import { useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { AnimatePresence } from 'motion/react';
import { handle, isRestore } from '@kestack/kabuki';
import type {
  ActorDefinition,
  Entry,
  Instance,
  Snapshot,
} from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react';
import { cn } from '#lib/utils';
import { INK } from './ink/index.ts';
import type { Tone } from './ink/index.ts';
import { AppMap } from './map/index.ts';
import type { Pick } from './map/index.ts';
import { sceneOf } from './scene/index.ts';
import type {
  Kind,
  Placed,
  Said,
  Scene,
  WorkerKey,
  WorkerStatus,
} from './scene/index.ts';
import { Sheet } from './sheet/index.ts';
import { Timeline } from './timeline/index.ts';

/*
 * The Inspector: the Step shown, drawn as a Map, with the Sheet and the
 * Timeline under it. It fills whatever holds it, and lays itself out by its
 * own width, not the screen's.
 *
 * 1. Scene     the Map of the Step shown, from the Actors and its Snapshot,
 *              with the live app's Workers laid over it when it is live.
 * 2. Pick      a card, a State or Worker on it, one of its Instances, or the
 *              Step's Message; a pick gone from the Step shown closes the
 *              Sheet.
 * 3. Sheet     what is picked, taken apart.
 * 4. Timeline  which Step is shown, and whether it is live.
 */

type Statuses = NonNullable<Parameters<typeof sceneOf>[0]['statuses']>;

/*
 * The Kabuki devtools: the Inspector on a running app, from its
 * runtime (`App.useRuntime()`). It fills whatever holds it.
 *
 * 1. Steps     init, then every entry on the Branch shown: the Head's, or
 *              the one a Step shown from another Branch is on.
 * 2. Step      the Step shown is the app's own: picking one on the Timeline
 *              Time Travels the app, and going live comes back to the Head.
 *              Forking goes live from the Step shown instead, growing a new
 *              Branch from it; the old one stays in the History.
 *              Its Snapshot is replayed from the History; the Commands its
 *              Message asked for are worked out again from the Step before,
 *              once each.
 * 3. Workers   live and running, what each Instance's Workers are doing.
 * 4. Window    how many entries the History keeps, changed at any time.
 */
export function KabukiDevtools({
  runtime,
  layout,
  dotted,
  presenting = false,
  className,
}: {
  /** The running app: `App.useRuntime()`. */
  readonly runtime: AppRuntime;
  /** How the Map is laid out: a packed tree, or an outline. */
  readonly layout?: Kind;
  /** Dots under the Map. On by default; off, a background given by `className` shows through. */
  readonly dotted?: boolean;
  /** Only the Map, kept whole in view as the app changes: no Timeline and no controls, for a talk or a recording. */
  readonly presenting?: boolean;
  /** Classes for its root, merged over its own: a see-through background over the app. */
  readonly className?: string;
}) {
  const { history, branch, shown, running } = runtime;
  const definition = history.actor.definition;

  // 1. Steps
  const steps =
    typeof shown === 'number' && !branch.some((entry) => entry.id === shown)
      ? history.branch(shown)
      : branch;
  const live = shown === null;
  const at =
    shown === null
      ? steps.length
      : shown === 'init'
        ? 0
        : steps.findIndex((entry) => entry.id === shown) + 1;
  const entry = at === 0 ? undefined : steps[at - 1];

  // 2. Step
  // By the entry itself, not its id: ids start again in another runtime, or
  // once the History is cleared.
  const asked = useRef(new WeakMap<Entry, ReadonlyArray<unknown>>());
  const commandsOf = (of: Entry) => {
    const known = asked.current.get(of);
    if (known) return known;
    const commands = isRestore(of.message)
      ? []
      : handle(definition, history.snapshotAt(of.parent), of).commands;
    asked.current.set(of, commands);
    return commands;
  };
  const step = useMemo(
    () => ({
      snapshot: history.snapshotAt(entry?.id ?? null),
      ...(entry
        ? { said: { envelope: entry, commands: commandsOf(entry) } }
        : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- an entry never changes once written.
    [history, entry],
  );

  return (
    <Inspector
      definition={definition}
      step={step}
      {...(layout ? { layout } : {})}
      {...(className ? { className } : {})}
      {...(dotted === undefined ? {} : { dotted })}
      {...(presenting ? { presenting } : {})}
      // 3. Workers
      {...(live && running ? { statuses: runtime.workers } : {})}
      timeline={{
        steps: [
          { id: 'init', label: 'init' },
          ...steps.map((each) => ({
            id: `${each.id}`,
            label: each.message._tag,
          })),
        ],
        shown: at,
        live,
        onShow: (index) =>
          runtime.show(index === 0 ? 'init' : steps[index - 1]!.id),
        onLive: () => runtime.show(null),
        onFork: () => {
          if (shown === null) return;
          runtime.start(shown === 'init' ? null : shown);
          runtime.show(null);
        },
        head: steps === branch,
        window: history.window(),
        onWindow: history.keep,
      }}
    />
  );
}

export function Inspector({
  definition,
  step,
  statuses,
  layout,
  timeline,
  dotted,
  presenting = false,
  className,
}: {
  /** The root Actor's definition. */
  readonly definition: ActorDefinition;
  /** The Step shown: its Snapshot, and the Message that made it; none for init. */
  readonly step: { readonly snapshot: Snapshot; readonly said?: Said };
  /** What the live app says of each Instance's Workers, while the Step shown is live. */
  readonly statuses?: Statuses;
  /** How the Map is laid out: a packed tree, or an outline. */
  readonly layout?: Kind;
  readonly timeline: ComponentProps<typeof Timeline>;
  /** Dots under the Map. On by default. */
  readonly dotted?: boolean;
  /** Only the Map, kept whole in view: no Timeline and no controls. */
  readonly presenting?: boolean;
  /** Classes for its root, merged over its own. */
  readonly className?: string;
}) {
  const [picked, setPicked] = useState<Pick | undefined>(undefined);
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());

  // 1. Scene
  const scene = useMemo(
    () =>
      sceneOf({
        definition,
        snapshot: step.snapshot,
        ...(step.said ? { said: step.said } : {}),
        ...(statuses ? { statuses } : {}),
        ...(layout ? { layout } : {}),
        chosen,
        folded,
      }),
    [definition, step, statuses, layout, chosen, folded],
  );

  // 2. Pick and 3. Sheet
  const sheet = picked && sheetOf(scene, picked);

  return (
    <div
      className={cn(
        '@container bg-background text-foreground relative flex h-full w-full flex-col overflow-clip',
        className,
      )}
      style={INK}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <AppMap
            scene={scene}
            {...(dotted === undefined ? {} : { dotted })}
            {...(presenting ? { follow: true } : {})}
            picked={sheet ? picked : undefined}
            onPick={setPicked}
            onChoose={(place, instance) =>
              setChosen((was) => new Map(was).set(place, instance))
            }
            onFold={(place) =>
              setFolded((was) => {
                const next = new Set(was);
                if (!next.delete(place)) next.add(place);
                return next;
              })
            }
          />
        </div>
        <AnimatePresence>
          {sheet && (
            <Sheet
              key="sheet"
              {...sheet}
              onClose={() => setPicked(undefined)}
            />
          )}
        </AnimatePresence>
      </div>
      {/* 4. Timeline */}
      {!presenting && <Timeline {...timeline} />}
    </div>
  );
}

type SheetOf = Omit<ComponentProps<typeof Sheet>, 'onClose'>;

const dataOf = ({ _tag, ...data }: { readonly _tag: string }) => data;
const hasFields = (value: object) => Object.keys(value).length > 0;
const isEmpty = (value: unknown) =>
  value !== null && typeof value === 'object' && !hasFields(value);

const TONE: Record<WorkerStatus, Tone> = {
  running: 'running',
  finished: 'dim',
  failed: 'failed',
  on: 'lit',
};

const keyName = (name: string, key: WorkerKey) =>
  key.key === '' ? name : `${name}#${key.key}`;

/** Who Sent the Message, in words. */
const fromOf = ({ source, send }: NonNullable<Scene['beats']>) => {
  switch (source.kind) {
    case 'view':
      return 'its View';
    case 'command':
      return `Command ${send?.by ?? source.name}`;
    case 'worker':
      return `Worker ${send?.by ?? source.name}`;
    case 'provide':
      return 'what it Provides';
    case 'outside':
      return 'outside the app';
    case 'restore':
      return 'a Restore';
  }
};

/** What the Sheet shows of a pick, or nothing if it is not in this Step. */
const sheetOf = (scene: Scene, pick: Pick): SheetOf | undefined => {
  if ('message' in pick) {
    const beats = scene.beats;
    if (!beats) return undefined;
    return {
      kind: 'Message',
      tone: 'message',
      title: beats.tag,
      facts: [
        {
          label: 'To',
          value: beats.to ? scene.at.get(beats.to)!.name : 'dropped',
        },
        { label: 'From', value: fromOf(beats) },
        { label: 'Time', value: `${(beats.at / 1000).toFixed(2)}s` },
      ],
      sections: [
        { title: 'Payload', value: beats.payload },
        ...(beats.commands.length
          ? [{ title: 'Commands asked for', value: beats.commands }]
          : []),
      ],
    };
  }

  const node = scene.at.get(pick.node);
  if (!node) return undefined;
  const { part } = pick;
  if (part && 'worker' in part)
    return workerSheet(node, part.worker, scene.live);
  if (part && 'state' in part) return stateSheet(node, part.state);

  const one =
    pick.instance !== undefined
      ? node.instances.find((each) => each.id === pick.instance)
      : !node.many
        ? node.instances[0]
        : undefined;
  if (one) return instanceSheet(node.name, one);
  if (node.instances.length === 0)
    return {
      kind: 'Actor',
      tone: 'dim',
      title: node.name,
      facts: [{ label: 'Running', value: 'no Instance here at this Step' }],
    };
  return {
    kind: 'Actor',
    title: node.name,
    facts: [
      { label: 'Instances', value: node.instances.length },
      ...(node.states
        ? [
            {
              label: 'In each State',
              value: node.states
                .flat()
                .map((option) => `${option.tag} ${option.count}`)
                .join(' · '),
            },
          ]
        : []),
    ],
  };
};

/** One Instance taken apart. */
const instanceSheet = (name: string, instance: Instance): SheetOf => {
  const state = dataOf(instance.state);
  return {
    kind: 'Instance',
    title: instance.key === undefined ? name : `${name}#${instance.key}`,
    facts: [
      { label: 'ID', value: instance.id },
      ...(instance.state._tag === 'Single'
        ? []
        : [{ label: 'State', value: instance.state._tag }]),
      ...(instance.key === undefined
        ? []
        : [{ label: 'Key', value: instance.key }]),
    ],
    sections: [
      ...(isEmpty(instance.model)
        ? []
        : [{ title: 'Model', value: instance.model }]),
      ...(hasFields(state)
        ? [{ title: `State ${instance.state._tag}`, value: state }]
        : []),
      ...(instance.props === undefined
        ? []
        : [{ title: 'Props', value: instance.props }]),
    ],
  };
};

/** One State of a card: which Instances are in it, and its data if one is. */
const stateSheet = (node: Placed, tag: string): SheetOf => {
  const inIt = node.instances.filter((each) => each.state._tag === tag);
  const data = !node.many && inIt[0] ? dataOf(inIt[0].state) : {};
  return {
    kind: 'State',
    tone: inIt.length ? 'active' : 'dim',
    title: tag,
    facts: [
      { label: 'Of', value: node.name },
      node.many
        ? { label: 'Instances in it', value: inIt.length }
        : {
            label: 'Active',
            value: inIt.length
              ? 'yes'
              : node.instances[0]
                ? `no, it is in ${node.instances[0].state._tag}`
                : 'not running at this Step',
          },
    ],
    sections: hasFields(data) ? [{ title: 'Data', value: data }] : [],
  };
};

/** One Worker of a card: where it is written, and each key it runs now. */
const workerSheet = (node: Placed, name: string, live: boolean): SheetOf => {
  const row = node.workers.find((each) => each.name === name);
  const keys = row?.keys ?? [];
  return {
    kind: 'Worker',
    tone: keys.some((each) => each.status === 'failed')
      ? 'failed'
      : keys.length
        ? 'running'
        : 'dim',
    title: name,
    facts: [
      { label: 'Of', value: node.name },
      {
        label: 'Written',
        value: row?.state ? `in ${row.state}` : 'at its top',
      },
      { label: 'Keys on', value: keys.length || 'none' },
    ],
    rows: {
      title: live ? 'Keys, live' : 'Keys on at this Step',
      items: keys.map((key) => ({
        label:
          key.instance.key === undefined
            ? keyName(name, key)
            : `${keyName(name, key)} · ${key.instance.key}`,
        detail: key.status,
        tone: TONE[key.status],
      })),
    },
  };
};
