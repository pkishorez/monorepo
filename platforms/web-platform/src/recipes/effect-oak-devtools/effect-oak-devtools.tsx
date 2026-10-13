import { useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { AnimatePresence } from 'motion/react';
import { handle, isRestore } from 'effect-oak';
import type { ActorDefinition, Entry, Instance, Snapshot } from 'effect-oak';
import type { AppRuntime } from 'effect-oak/react';
import { INK, ink } from './ink/index.ts';
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
 * 2. Where     a mark in the corner saying whether this is the live app or a
 *              past Step, and so what the Workers' dots can say.
 * 3. Pick      a card, a State or Worker on it, one of its Instances, or the
 *              Step's Message; a pick gone from the Step shown closes the
 *              Sheet.
 * 4. Sheet     what is picked, taken apart.
 * 5. Timeline  which Step is shown.
 */

type Statuses = NonNullable<Parameters<typeof sceneOf>[0]['statuses']>;

/*
 * The Effect Oak devtools: the Inspector on a running app, from its
 * runtime (`App.useRuntime()`). It fills whatever holds it.
 *
 * 1. Steps     init, then every entry on the Branch shown: the Head's, or
 *              the one a Step shown from another Branch is on.
 * 2. Step      the Step shown is the app's own: picking one on the Timeline
 *              Time Travels the app, and going live comes back to the Head.
 *              Its Snapshot is replayed from the History; the Commands its
 *              Message asked for are worked out again from the Step before,
 *              once each.
 * 3. Workers   live and running, what each Instance's Workers are doing.
 */
export function EffectOakDevtools({
  runtime,
  layout,
}: {
  /** The running app: `App.useRuntime()`. */
  readonly runtime: AppRuntime;
  /** How the Map is laid out: a packed tree, or an outline. */
  readonly layout?: Kind;
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
  const asked = useRef(new Map<number, ReadonlyArray<unknown>>());
  const commandsOf = (of: Entry) => {
    const known = asked.current.get(of.id);
    if (known) return known;
    const commands = isRestore(of.message)
      ? []
      : handle(definition, history.snapshotAt(of.parent), of).commands;
    asked.current.set(of.id, commands);
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

  // 3. Pick and 4. Sheet
  const sheet = picked && sheetOf(scene, picked);

  return (
    <div
      className="@container bg-background text-foreground relative flex h-full w-full flex-col overflow-clip"
      style={INK}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <AppMap
            scene={scene}
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
          {/* 2. Where */}
          <p className="bg-background/85 pointer-events-none absolute top-3 left-3 flex h-7 items-center gap-2 rounded-full border px-3 text-[11px] backdrop-blur-sm">
            <span
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: scene.live ? ink('active') : ink('dim'),
              }}
            />
            {scene.live ? (
              <span className="font-medium">Live</span>
            ) : (
              <>
                <span className="font-medium">A past Step</span>
                <span className="text-muted-foreground hidden @md:inline">
                  Workers show only whether they are on
                </span>
              </>
            )}
          </p>
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
      {/* 5. Timeline */}
      <Timeline {...timeline} />
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
