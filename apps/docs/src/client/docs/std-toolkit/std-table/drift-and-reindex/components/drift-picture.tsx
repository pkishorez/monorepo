import {
  Flash,
  Roll,
  Walkthrough,
  useWalkthrough,
} from '../../../../../components/index.ts';

/*
 * Two high-priority tasks in the table, one saved before byPriority
 * existed. Its index key is empty, so a byPriority query finds only the
 * other, lit in the accent. drift points at the empty key; reindex writes
 * it, keeping the row's update stamp; then the same query finds both.
 * The rows never move or grow: only borders and the one key change.
 */

type Step = {
  readonly found: ReadonlyArray<string>;
  readonly drifted: boolean;
  readonly repaired: boolean;
  readonly caption: string;
};

const STEPS: ReadonlyArray<Step> = [
  {
    found: [],
    drifted: false,
    repaired: false,
    caption:
      'Two high-priority tasks. old-1 was saved before byPriority existed, so its index key is empty.',
  },
  {
    found: ['new-1'],
    drifted: false,
    repaired: false,
    caption:
      "A byPriority query for 'high' finds only new-1. old-1 has no key to be found by.",
  },
  {
    found: [],
    drifted: true,
    repaired: false,
    caption:
      'drift compares old-1 with the keys this release would give it, and points at the gap.',
  },
  {
    found: [],
    drifted: false,
    repaired: true,
    caption:
      'reindex writes the missing key. The values and the update stamp stay as they were.',
  },
  {
    found: ['old-1', 'new-1'],
    drifted: false,
    repaired: true,
    caption: 'The same byPriority query now finds both tasks.',
  },
];
const CAPTIONS = STEPS.map((each) => each.caption);

const columns =
  'grid grid-cols-[3.5rem_3.5rem_1fr] gap-3 sm:grid-cols-[4.5rem_3.5rem_1fr]';

function Row({
  id,
  index,
  found,
  marked,
  flash,
}: {
  readonly id: string;
  readonly index: string;
  readonly found: boolean;
  readonly marked: boolean;
  readonly flash?: number;
}) {
  return (
    <div
      className={`relative ${columns} items-center rounded-lg border bg-background px-3 py-2 font-mono text-[11.5px] transition-colors duration-300 ${found ? 'border-(--field-accent)' : 'border-border'}`}
    >
      <span>{id}</span>
      <span className="text-muted-foreground">high</span>
      <span
        className={`w-fit rounded px-1 outline-1 outline-offset-1 transition-[outline-color] duration-300 ${marked ? 'outline-dashed outline-(--field-accent)' : 'outline-transparent'}`}
      >
        <Roll value={index} />
      </span>
      <Flash at={flash} />
    </div>
  );
}

export function DriftPicture() {
  const walk = useWalkthrough(CAPTIONS);
  const { step, round } = walk;
  const now = STEPS[step]!;
  return (
    <Walkthrough walk={walk}>
      <div className="grid place-items-center px-4 py-8">
        <div className="w-full max-w-80 space-y-1.5">
          <div
            className={`${columns} px-3 font-mono text-[11px] text-muted-foreground`}
          >
            <span>taskId</span>
            <span>priority</span>
            <span>GSI1PK</span>
          </div>
          <Row
            id="old-1"
            index={now.repaired ? 'Task#high' : '—'}
            found={now.found.includes('old-1')}
            marked={now.drifted}
            flash={step === 3 ? round * 10 + 3 : undefined}
          />
          <Row
            id="new-1"
            index="Task#high"
            found={now.found.includes('new-1')}
            marked={false}
          />
        </div>
      </div>
    </Walkthrough>
  );
}
