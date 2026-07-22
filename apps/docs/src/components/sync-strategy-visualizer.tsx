import { useEffect, useState, type ReactNode } from 'react';

/**
 * Interactive demo of the three partitioned sync strategies. One partition (a
 * chat channel) is a horizontal timeline of messages ordered by `_u`; the
 * server row is everything that exists, the truth row is what has reached the
 * Source of Truth, and the coverage bar mirrors the persisted Sync State.
 *
 * The simulation follows the strategy sources exactly:
 * - `strategies/old-to-new/old-to-new.ts` — fetch forward from the cursor,
 *   write the batch, persist the batch's newest entity as the new cursor.
 * - `strategies/new-to-old/new-to-old.ts` — a descending backfill anchored
 *   batch-to-batch via `previousFloor`, a live tail that waits for `topReady`
 *   and anchors at the first batch's top, and `reachedOldest` committed when
 *   the older stream completes.
 * - `strategies/bidirectional/bidirectional.ts` — two initial fetches anchor
 *   both ends, downward/upward loops converge until `reconcile` collapses the
 *   slices to one, and the live tail stays open throughout.
 */

type StrategyId = 'oldToNew' | 'newToOld' | 'bidirectional';

interface Item {
  u: string;
  short: string;
  arrived: boolean;
}

interface SliceU {
  lowU: string;
  highU: string;
}

interface Narr {
  title: string;
  detail: string;
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FLAVOR = 'K3TQ7ZDXMHW9C4RV';
const INITIAL_COUNT = 10;
const MAX_ITEMS = 16;
const PAGE = 3;

const makeItem = (index: number, arrived: boolean): Item => {
  const pair = `${ALPHABET[index + 10]}${FLAVOR[index]}`;
  return { u: `01J9GX${pair}`, short: pair, arrived };
};

const initialItems = (): Item[] =>
  Array.from({ length: INITIAL_COUNT }, (_, i) => makeItem(i, false));

const short = (u: string) => u.slice(-2);

/** Port of `strategies/slices/reconcile.ts` over bare `_u` strings. */
const reconcileU = (slices: SliceU[], candidate: SliceU): SliceU[] => {
  const all = [...slices, candidate].sort((a, b) =>
    a.lowU < b.lowU ? -1 : a.lowU > b.lowU ? 1 : 0,
  );
  const merged: SliceU[] = [];
  for (const slice of all) {
    const last = merged[merged.length - 1];
    if (last && slice.lowU <= last.highU) {
      if (slice.highU > last.highU) last.highU = slice.highU;
    } else {
      merged.push({ ...slice });
    }
  }
  return merged;
};

const addDrained = (drained: string[], batch: string[]): string[] => [
  ...drained,
  ...batch.filter((u) => !drained.includes(u)),
];

interface BaseSim {
  items: Item[];
  drained: string[];
  lastBatch: string[];
  narr: Narr;
  steps: number;
}

interface OldToNewSim extends BaseSim {
  strategy: 'oldToNew';
  cursorU: string | null;
  caughtUp: boolean;
}

interface NewToOldSim extends BaseSim {
  strategy: 'newToOld';
  slices: SliceU[];
  reachedOldest: boolean;
  backfillUs: string[];
  backfillFloorU: string | null;
  tailAnchorU: string | null;
  tailStarted: boolean;
  streamDone: boolean;
  pendingTail: string[];
}

interface BidirectionalSim extends BaseSim {
  strategy: 'bidirectional';
  slices: SliceU[];
  started: boolean;
  converged: boolean;
  tailAnchorU: string | null;
  pendingTail: string[];
  nextLoop: 'down' | 'up';
}

type Sim = OldToNewSim | NewToOldSim | BidirectionalSim;

const makeSim = (strategy: StrategyId): Sim => {
  const items = initialItems();
  const base = {
    items,
    drained: [] as string[],
    lastBatch: [] as string[],
    steps: 0,
  };
  switch (strategy) {
    case 'oldToNew':
      return {
        ...base,
        strategy,
        cursorU: null,
        caughtUp: false,
        narr: {
          title: 'Ready — Sync State is { cursor: null }',
          detail:
            'Nothing has been drained yet, so the persisted cursor is null. The first forwardFetch will start at the very oldest message in the partition. Press play or step through.',
        },
      };
    case 'newToOld':
      return {
        ...base,
        strategy,
        slices: [],
        reachedOldest: false,
        backfillUs: items.map((it) => it.u).reverse(),
        backfillFloorU: null,
        tailAnchorU: null,
        tailStarted: false,
        streamDone: false,
        pendingTail: [],
        narr: {
          title: 'Ready — { slices: [], reachedOldest: false }',
          detail:
            'Two fibers are about to start concurrently: subscribeOlder will descend from the newest message, and the live tail waits on topReady — it cannot subscribe until the first backfill batch reveals where "the top" is.',
        },
      };
    case 'bidirectional':
      return {
        ...base,
        strategy,
        slices: [],
        started: false,
        converged: false,
        tailAnchorU: null,
        pendingTail: [],
        nextLoop: 'down',
        narr: {
          title: 'Ready — { slices: [] }',
          detail:
            'The run opens with two concurrent fetches, one from each end of the partition: fetchOlder({ cursor: null }) grabs the newest page while forwardFetch({ cursor: null }) grabs the oldest.',
        },
      };
  }
};

const canStep = (sim: Sim): boolean => {
  switch (sim.strategy) {
    case 'oldToNew':
      if (!sim.caughtUp) return true;
      return sim.items.some((it) => sim.cursorU === null || it.u > sim.cursorU);
    case 'newToOld':
      if (sim.tailStarted && sim.pendingTail.length > 0) return true;
      if (!sim.streamDone) return true;
      return !sim.reachedOldest;
    case 'bidirectional':
      if (!sim.started) return true;
      if (sim.pendingTail.length > 0) return true;
      return !sim.converged;
  }
};

const phaseOf = (sim: Sim): string => {
  switch (sim.strategy) {
    case 'oldToNew':
      if (sim.cursorU === null) return 'waiting to start';
      return sim.caughtUp ? 'live — following arrivals' : 'draining history';
    case 'newToOld':
      if (!sim.tailStarted) return 'waiting to start';
      return sim.reachedOldest
        ? 'live — history complete'
        : 'backfilling + live tail';
    case 'bidirectional':
      if (!sim.started) return 'waiting to start';
      return sim.converged ? 'live — gap closed' : 'closing the gap';
  }
};

const tailPatch = (sim: {
  steps: number;
  drained: string[];
  slices: SliceU[];
  tailAnchorU: string | null;
  pendingTail: string[];
}) => {
  const batchUs = sim.pendingTail;
  const highU = batchUs[batchUs.length - 1]!;
  const lowU = sim.tailAnchorU ?? batchUs[0]!;
  return {
    steps: sim.steps + 1,
    drained: addDrained(sim.drained, batchUs),
    lastBatch: batchUs,
    slices: reconcileU(sim.slices, { lowU, highU }),
    tailAnchorU: highU,
    pendingTail: [] as string[],
    narr: {
      title: `live tail: subscribeNewer delivers ${batchUs.length} message${batchUs.length === 1 ? '' : 's'}`,
      detail:
        'writeServerTruth writes the batch, then commit(addRange(tailAnchor, newest)) extends the covered range from the previous tail position. The top edge only ever grows upward — no seam, no hole — while anything still working below keeps going.',
    },
  };
};

const stepOldToNew = (sim: OldToNewSim): OldToNewSim => {
  const after = sim.items.filter(
    (it) => sim.cursorU === null || it.u > sim.cursorU,
  );
  if (after.length === 0) {
    return {
      ...sim,
      steps: sim.steps + 1,
      lastBatch: [],
      caughtUp: true,
      narr: {
        title: 'forwardFetch → empty batch',
        detail:
          'Nothing is newer than the cursor: history is drained. A poll-based run ends here; with a stream source the strategy stays subscribed and arrivals flow through the same write-then-advance path. Try "New message arrives".',
      },
    };
  }
  const batch = after.slice(0, PAGE);
  const newest = batch[batch.length - 1]!;
  const narr: Narr = sim.caughtUp
    ? {
        title: `stream delivers …${newest.short}`,
        detail:
          'The subscription pushes the arrival as just another batch: writeServerTruth, then setState({ cursor }) moves the cursor up to it. Because _u is monotonic the cursor only ever moves forward — everything at or below it stays complete.',
      }
    : {
        title: `forwardFetch({ cursor: ${sim.cursorU === null ? 'null' : `…${short(sim.cursorU)}`} }) → ${batch.length} items`,
        detail:
          sim.cursorU === null
            ? 'A null cursor means "start from the oldest". The batch is written through writeServerTruth, then setState persists the batch\'s newest entity as the cursor. Crash now and the next run resumes exactly here.'
            : 'Each page picks up strictly after the persisted cursor, oldest-first. Write the batch, advance the cursor, persist — that two-line loop is the whole strategy.',
      };
  return {
    ...sim,
    steps: sim.steps + 1,
    drained: addDrained(
      sim.drained,
      batch.map((it) => it.u),
    ),
    lastBatch: batch.map((it) => it.u),
    cursorU: newest.u,
    narr,
  };
};

const stepNewToOld = (sim: NewToOldSim): NewToOldSim => {
  if (sim.tailStarted && sim.pendingTail.length > 0) {
    return { ...sim, ...tailPatch(sim) };
  }
  if (!sim.streamDone) {
    const batch = sim.backfillUs.slice(0, PAGE);
    const rest = sim.backfillUs.slice(PAGE);
    const batchTop = batch[0]!;
    const batchFloor = batch[batch.length - 1]!;
    const highU = sim.backfillFloorU ?? batchTop;
    const first = !sim.tailStarted;
    return {
      ...sim,
      steps: sim.steps + 1,
      drained: addDrained(sim.drained, batch),
      lastBatch: batch,
      slices: reconcileU(sim.slices, { lowU: batchFloor, highU }),
      backfillUs: rest,
      backfillFloorU: batchFloor,
      tailStarted: true,
      tailAnchorU: first ? batchTop : sim.tailAnchorU,
      streamDone: rest.length === 0,
      narr: first
        ? {
            title: `backfill: subscribeOlder({ cursor: null }) → ${batch.length} items`,
            detail: `The descending stream starts at the newest message. The batch is written and committed as the first covered slice, and its newest entity resolves topReady — the live tail can now subscribe strictly above …${short(batchTop)}.`,
          }
        : {
            title: `backfill: next older page → ${batch.length} item${batch.length === 1 ? '' : 's'}`,
            detail:
              'commit(addRange(batchFloor, previousFloor)) anchors each batch to the floor of the one before it, so the covered range descends without ever leaving a gap between batches.',
          },
    };
  }
  return {
    ...sim,
    steps: sim.steps + 1,
    lastBatch: [],
    reachedOldest: true,
    narr: {
      title: 'older stream completed → reachedOldest: true',
      detail:
        'The descending stream hit the floor of the partition and closed, so the strategy commits markReachedOldest. A restart now knows the backfill never needs to run again — only the live tail resumes.',
    },
  };
};

const stepBidirectional = (sim: BidirectionalSim): BidirectionalSim => {
  if (!sim.started) {
    const oldest = sim.items.slice(0, PAGE);
    const latest = sim.items.slice(-PAGE);
    let slices = reconcileU([], {
      lowU: latest[0]!.u,
      highU: latest[latest.length - 1]!.u,
    });
    slices = reconcileU(slices, {
      lowU: oldest[0]!.u,
      highU: oldest[oldest.length - 1]!.u,
    });
    const freshTop = latest[latest.length - 1]!.u;
    const batch = addDrained(
      oldest.map((it) => it.u),
      latest.map((it) => it.u),
    );
    return {
      ...sim,
      steps: sim.steps + 1,
      drained: addDrained(sim.drained, batch),
      lastBatch: batch,
      slices,
      started: true,
      converged: slices.length <= 1,
      tailAnchorU: freshTop,
      narr: {
        title: 'anchor both ends — two concurrent fetches',
        detail: `fetchOlder({ cursor: null }) returned the newest ${latest.length} messages while forwardFetch({ cursor: null }) returned the oldest ${oldest.length}, concurrently. Both were written and committed — two disjoint slices with one gap between them. The live tail subscribes above …${short(freshTop)}.`,
      },
    };
  }
  if (sim.pendingTail.length > 0) return { ...sim, ...tailPatch(sim) };

  const collapseNote =
    ' reconcile merged the ranges into one slice — collapsed(s) is now true, so both fill loops stop and only the live tail stays open.';

  if (sim.nextLoop === 'down') {
    const top = sim.slices[sim.slices.length - 1]!;
    const candidates = sim.items.filter((it) => it.u < top.lowU);
    const batch = candidates.slice(-PAGE);
    const slices = reconcileU(sim.slices, {
      lowU: batch[0]!.u,
      highU: top.lowU,
    });
    const converged = slices.length <= 1;
    return {
      ...sim,
      steps: sim.steps + 1,
      drained: addDrained(
        sim.drained,
        batch.map((it) => it.u),
      ),
      lastBatch: batch.map((it) => it.u),
      slices,
      converged,
      nextLoop: 'up',
      narr: {
        title: `downward loop: fetchOlder({ cursor: …${short(top.lowU)} }) → ${batch.length} items`,
        detail: `The downward loop reads the top slice, fetches the page just below its low edge, writes it, and commits addRange(oldestOf(batch), top.low) — anchored to the slice it grows, so coverage extends without a seam.${converged ? collapseNote : ''}`,
      },
    };
  }
  const bottom = sim.slices[0]!;
  const candidates = sim.items.filter((it) => it.u > bottom.highU);
  const batch = candidates.slice(0, PAGE);
  const slices = reconcileU(sim.slices, {
    lowU: bottom.highU,
    highU: batch[batch.length - 1]!.u,
  });
  const converged = slices.length <= 1;
  return {
    ...sim,
    steps: sim.steps + 1,
    drained: addDrained(
      sim.drained,
      batch.map((it) => it.u),
    ),
    lastBatch: batch.map((it) => it.u),
    slices,
    converged,
    nextLoop: 'down',
    narr: {
      title: `upward loop: forwardFetch({ cursor: …${short(bottom.highU)} }) → ${batch.length} items`,
      detail: `The upward loop mirrors it from the other end: fetch the page just above the bottom slice's high edge and commit addRange(bottom.high, newestOf(batch)).${converged ? collapseNote : ''}`,
    },
  };
};

const stepSim = (sim: Sim): Sim => {
  switch (sim.strategy) {
    case 'oldToNew':
      return stepOldToNew(sim);
    case 'newToOld':
      return stepNewToOld(sim);
    case 'bidirectional':
      return stepBidirectional(sim);
  }
};

const arriveSim = (sim: Sim): Sim => {
  if (sim.items.length >= MAX_ITEMS) return sim;
  const item = makeItem(sim.items.length, true);
  const pickup =
    sim.strategy === 'oldToNew'
      ? sim.caughtUp
        ? 'The open stream will deliver it on the next step.'
        : 'The forward drain will sweep it up when the cursor gets there.'
      : sim.strategy === 'bidirectional' && !sim.started
        ? 'The initial newest-page fetch will include it.'
        : 'The live tail will deliver it on the next step.';
  const narr: Narr = {
    title: `message …${item.short} arrives on the server`,
    detail: `Its _u is minted from the current timestamp, so it sorts after every existing message — above the drained interval, never inside it. That is the upward-migration invariant: once an interval of history is drained, later writes cannot punch a hole in it. ${pickup}`,
  };
  switch (sim.strategy) {
    case 'oldToNew':
      return { ...sim, items: [...sim.items, item], lastBatch: [], narr };
    case 'newToOld':
      return {
        ...sim,
        items: [...sim.items, item],
        lastBatch: [],
        narr,
        pendingTail: [...sim.pendingTail, item.u],
      };
    case 'bidirectional':
      return {
        ...sim,
        items: [...sim.items, item],
        lastBatch: [],
        narr,
        pendingTail: sim.started
          ? [...sim.pendingTail, item.u]
          : sim.pendingTail,
      };
  }
};

const isCovered = (sim: Sim, u: string): boolean =>
  sim.strategy === 'oldToNew'
    ? sim.cursorU !== null && u <= sim.cursorU
    : sim.slices.some((s) => s.lowU <= u && u <= s.highU);

const isSliceEdge = (
  sim: Sim,
  u: string,
  index: number,
): [boolean, boolean] => {
  if (sim.strategy === 'oldToNew') {
    return [index === 0, u === sim.cursorU];
  }
  return [
    sim.slices.some((s) => s.lowU === u),
    sim.slices.some((s) => s.highU === u),
  ];
};

const markersOf = (sim: Sim): Map<string, string> => {
  const markers = new Map<string, string>();
  switch (sim.strategy) {
    case 'oldToNew':
      if (sim.cursorU !== null) markers.set(sim.cursorU, '▲');
      return markers;
    case 'newToOld': {
      const top = sim.slices[sim.slices.length - 1];
      if (top && !sim.reachedOldest) markers.set(top.lowU, '◂');
      return markers;
    }
    case 'bidirectional': {
      if (!sim.started || sim.converged) return markers;
      const top = sim.slices[sim.slices.length - 1];
      const bottom = sim.slices[0];
      if (top) markers.set(top.lowU, '◂');
      if (bottom) markers.set(bottom.highU, '▸');
      return markers;
    }
  }
};

const stateLines = (sim: Sim): string[] => {
  const sliceLines = (slices: SliceU[], trailingComma: boolean): string[] => {
    if (slices.length === 0)
      return [`  "slices": []${trailingComma ? ',' : ''}`];
    return [
      '  "slices": [',
      ...slices.map(
        (s, i) =>
          `    { "low": "${s.lowU}", "high": "${s.highU}" }${i < slices.length - 1 ? ',' : ''}`,
      ),
      `  ]${trailingComma ? ',' : ''}`,
    ];
  };
  switch (sim.strategy) {
    case 'oldToNew':
      return [
        '{',
        sim.cursorU === null
          ? '  "cursor": null'
          : `  "cursor": { "meta": { "_u": "${sim.cursorU}" }, … }`,
        '}',
      ];
    case 'newToOld':
      return [
        '{',
        ...sliceLines([...sim.slices], true),
        `  "reachedOldest": ${sim.reachedOldest}`,
        '}',
      ];
    case 'bidirectional':
      return ['{', ...sliceLines([...sim.slices], false), '}'];
  }
};

const strategies: { id: StrategyId; label: string; blurb: string }[] = [
  {
    id: 'oldToNew',
    label: 'old → new',
    blurb:
      'One cursor, one direction. The strategy drains the partition oldest-first in pages, persisting the newest drained entity as its cursor after every batch — crash anywhere and it resumes from there. Once history is empty, a stream source keeps it alive to follow new arrivals.',
  },
  {
    id: 'newToOld',
    label: 'new → old',
    blurb:
      'Newest messages first — what a chat UI actually wants. A live tail subscribes at the top while a descending backfill walks history toward the floor. Sync State tracks the covered _u slices and flips reachedOldest when the backfill stream completes.',
  },
  {
    id: 'bidirectional',
    label: 'bidirectional',
    blurb:
      'Anchor both ends, then close the gap. One fetch grabs the newest page, another grabs the oldest, and two fill loops walk toward each other until the covered slices collapse into one. The live tail keeps the top edge fresh the whole time.',
  },
];

const controlButton =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground disabled:pointer-events-none disabled:opacity-40';

function TimelineRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right text-[10px] font-medium uppercase tracking-wide text-fd-muted-foreground">
        {label}
      </span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Timeline({ sim }: { sim: Sim }) {
  const drainedSet = new Set(sim.drained);
  const lastBatchSet = new Set(sim.lastBatch);
  const markers = markersOf(sim);
  const cell =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-[10px]';

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max space-y-1 pb-1">
        <TimelineRow label="server">
          {sim.items.map((item) => {
            const pending = item.arrived && !drainedSet.has(item.u);
            return (
              <div
                key={item.u}
                title={item.u}
                className={`${cell} ${
                  pending
                    ? 'animate-in zoom-in border-amber-500/70 bg-amber-500/10 text-amber-700 duration-300 motion-reduce:animate-none dark:text-amber-400'
                    : 'bg-fd-background'
                }`}
              >
                {item.short}
              </div>
            );
          })}
        </TimelineRow>
        <TimelineRow label="truth">
          {sim.items.map((item) => {
            const drained = drainedSet.has(item.u);
            const fresh = lastBatchSet.has(item.u);
            return (
              <div
                key={item.u}
                title={item.u}
                className={`${cell} ${
                  drained
                    ? fresh
                      ? 'animate-in fade-in border-fd-primary bg-fd-primary/20 text-fd-primary duration-300 motion-reduce:animate-none'
                      : 'border-fd-primary/40 bg-fd-primary/10'
                    : 'border-dashed text-fd-muted-foreground/40'
                }`}
              >
                {item.short}
              </div>
            );
          })}
        </TimelineRow>
        <TimelineRow label="state">
          {sim.items.map((item, index) => {
            const covered = isCovered(sim, item.u);
            const [start, end] = isSliceEdge(sim, item.u, index);
            return (
              <div
                key={item.u}
                className="flex h-4 w-8 shrink-0 flex-col items-center gap-0.5"
              >
                <div
                  className={`h-1.5 w-full transition-colors duration-300 ${
                    covered
                      ? `bg-fd-primary ${start ? 'rounded-l-full' : ''} ${end ? 'rounded-r-full' : ''}`
                      : 'rounded-full bg-fd-muted'
                  }`}
                />
                <span className="text-[9px] leading-none text-fd-primary">
                  {markers.get(item.u) ?? ''}
                </span>
              </div>
            );
          })}
        </TimelineRow>
      </div>
    </div>
  );
}

export function SyncStrategyVisualizer(props: {
  initialStrategy?: 'oldToNew' | 'newToOld' | 'bidirectional';
}) {
  const [strategy, setStrategy] = useState<StrategyId>(
    props.initialStrategy ?? 'oldToNew',
  );
  const [sim, setSim] = useState<Sim>(() =>
    makeSim(props.initialStrategy ?? 'oldToNew'),
  );
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (!canStep(sim)) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setSim((s) => stepSim(s)), 1200);
    return () => clearTimeout(timer);
  }, [playing, sim]);

  const selectStrategy = (id: StrategyId) => {
    setStrategy(id);
    setSim(makeSim(id));
    setPlaying(false);
  };

  const active = strategies.find((s) => s.id === strategy)!;
  const stepable = canStep(sim);
  const pristine = sim.steps === 0 && sim.items.length === INITIAL_COUNT;

  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border bg-fd-card text-sm">
      <div className="flex flex-wrap gap-1.5 border-b bg-fd-muted/50 p-2">
        {strategies.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === strategy}
            onClick={() => selectStrategy(s.id)}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
              s.id === strategy
                ? 'border-fd-primary bg-fd-primary/10 font-medium text-fd-primary'
                : 'border-transparent text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto self-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fd-muted-foreground">
          {phaseOf(sim)}
        </span>
      </div>

      <p className="border-b px-4 py-3 text-xs leading-5 text-fd-muted-foreground sm:text-sm sm:leading-6">
        {active.blurb}
      </p>

      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
            #general — one partition, messages ordered by _u →
          </div>
          <Timeline sim={sim} />
          <p className="mt-1.5 text-[10px] leading-4 text-fd-muted-foreground">
            server = every message in the partition · truth = drained into the
            Source of Truth · state bar = the _u ranges Sync State says are
            covered
            {strategy === 'oldToNew'
              ? ' · ▲ cursor'
              : strategy === 'newToOld'
                ? ' · ◂ backfill frontier'
                : ' · ◂ ▸ fill frontiers'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
              Sync State — persisted after every commit
            </div>
            <div
              key={`${strategy}-${sim.steps}`}
              className="animate-in fade-in rounded-lg border bg-fd-background p-3 font-mono text-xs leading-5 duration-300 motion-reduce:animate-none"
            >
              {stateLines(sim).map((line, i) => (
                <div key={`${i}-${line}`} className="whitespace-pre">
                  {line}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-fd-muted-foreground">
              A restart resumes from exactly this. The real state stores full
              entities as cursors and slice edges; shown here by their meta._u.
            </p>
          </div>
          <div
            key={`n-${strategy}-${sim.steps}-${sim.items.length}`}
            className="animate-in fade-in rounded-lg border border-dashed p-3 duration-300 motion-reduce:animate-none"
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
              {sim.steps === 0 ? 'Before the run' : `Step ${sim.steps}`}
            </div>
            <div className="text-sm font-medium">{sim.narr.title}</div>
            <p className="mt-1 text-xs leading-5 text-fd-muted-foreground">
              {sim.narr.detail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${controlButton} border-fd-primary/40 text-fd-primary`}
            disabled={!playing && !stepable}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className={controlButton}
            disabled={!stepable}
            onClick={() => {
              setPlaying(false);
              setSim((s) => stepSim(s));
            }}
          >
            Step
          </button>
          <button
            type="button"
            className={controlButton}
            disabled={pristine}
            onClick={() => {
              setPlaying(false);
              setSim(makeSim(strategy));
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className={`${controlButton} ml-auto border-amber-500/50 text-amber-700 dark:text-amber-400`}
            disabled={sim.items.length >= MAX_ITEMS}
            onClick={() => setSim((s) => arriveSim(s))}
          >
            New message arrives
          </button>
        </div>
      </div>
    </div>
  );
}
