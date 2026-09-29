import type { Fingers } from '@kstackz/use-gesture';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  type Case,
  Choice,
  Code,
  Controls,
  LabZone,
  tint,
  Toggle,
  ZONE_COLORS,
} from '../-gestures/index.ts';
import { ARROWS, SwipeProbe } from './probe.tsx';

const Bottom = 'mt-auto';

/**
 * The band a Swipe's first finger must land in. `from` measures it from the
 * screen's edge, so it is drawn inside the zone from where the zone sits.
 */
function EdgeBand(props: {
  readonly edge: 'left' | 'right';
  readonly within: number;
}) {
  const [sky] = ZONE_COLORS;
  const ref = useRef<HTMLDivElement>(null);
  // How far the zone's inside starts from the screen's edge.
  const [inset, setInset] = useState(0);
  useLayoutEffect(() => {
    const zone = ref.current?.parentElement;
    if (zone === null || zone === undefined) return;
    const measure = () => {
      const rect = zone.getBoundingClientRect();
      const border = zone.clientLeft;
      setInset(
        props.edge === 'left'
          ? rect.left + border
          : innerWidth - rect.right + border,
      );
    };
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [props.edge]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        width: Math.max(props.within - inset, 0),
        backgroundColor: tint(sky ?? 'gray', 22),
        borderColor: sky,
      }}
      className={
        props.edge === 'left'
          ? 'pointer-events-none absolute inset-y-0 left-0 z-10 border-r-2 border-dashed'
          : 'pointer-events-none absolute inset-y-0 right-0 z-10 border-l-2 border-dashed'
      }
    />
  );
}

function OneStage() {
  return (
    <LabZone n={1} name="Zone" className="flex flex-1 flex-col">
      <SwipeProbe
        zone={1}
        name="Zone"
        options={{ direction: 'down' }}
        className={Bottom}
      />
    </LabZone>
  );
}

function DirectionsStage() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
      {(['up', 'down', 'left', 'right'] as const).map((direction, i) => (
        <LabZone
          key={direction}
          n={i + 1}
          name={`${ARROWS[direction]} ${direction}`}
          className="flex min-h-0 flex-col"
        >
          <SwipeProbe
            zone={i + 1}
            name={`${ARROWS[direction]} ${direction}`}
            options={{ direction }}
            compact
            caption={`useSwipe ${ARROWS[direction]} ${direction}`}
            className={Bottom}
          />
        </LabZone>
      ))}
    </div>
  );
}

const FINGER_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '1-3', label: '1–3' },
];

const fingersOf = (value: string): Fingers =>
  value === '1-3' ? [1, 3] : Number(value);

function FingersStage() {
  const [fingers, setFingers] = useState('2');
  return (
    <>
      <Controls>
        <Choice
          label="fingers"
          value={fingers}
          options={FINGER_OPTIONS}
          onChange={setFingers}
        />
      </Controls>
      <LabZone n={1} name="Zone" className="flex flex-1 flex-col">
        <SwipeProbe
          zone={1}
          name="Zone"
          options={{ direction: 'down', fingers: fingersOf(fingers) }}
          className={Bottom}
        />
      </LabZone>
    </>
  );
}

function FlickStage() {
  return (
    <LabZone n={1} name="Zone" className="flex flex-1 flex-col">
      <SwipeProbe
        zone={1}
        name="Zone"
        options={{ direction: 'down', commit: { velocity: 800 } }}
        className={Bottom}
      />
    </LabZone>
  );
}

const DISTANCES = [
  { value: 0, label: 'off' },
  { value: 40, label: '40' },
  { value: 120, label: '120' },
] as const;

const VELOCITIES = [
  { value: 0, label: 'off' },
  { value: 400, label: '400' },
  { value: 1200, label: '1200' },
] as const;

function RuleStage() {
  const [distance, setDistance] = useState<number>(120);
  const [velocity, setVelocity] = useState<number>(1200);
  const commit = {
    ...(distance === 0 ? {} : { distance }),
    ...(velocity === 0 ? {} : { velocity }),
  };
  return (
    <>
      <Controls>
        <Choice
          label="distance"
          value={distance}
          options={DISTANCES}
          onChange={setDistance}
        />
        <Choice
          label="velocity"
          value={velocity}
          options={VELOCITIES}
          onChange={setVelocity}
        />
      </Controls>
      <LabZone n={1} name="Zone" className="flex flex-1 flex-col">
        <SwipeProbe
          zone={1}
          name="Zone"
          options={{ direction: 'down', commit }}
          className={Bottom}
        />
      </LabZone>
    </>
  );
}

function EdgeStage() {
  const [edge, setEdge] = useState<'left' | 'right'>('left');
  const [within, setWithin] = useState(40);
  return (
    <>
      <Controls>
        <Choice
          label="edge"
          value={edge}
          options={[
            { value: 'left', label: 'left' },
            { value: 'right', label: 'right' },
          ]}
          onChange={setEdge}
        />
        <Choice
          label="within"
          value={within}
          options={[
            { value: 40, label: '40' },
            { value: 80, label: '80' },
          ]}
          onChange={setWithin}
        />
      </Controls>
      <LabZone n={1} name="Zone" className="flex flex-1 flex-col">
        <EdgeBand edge={edge} within={within} />
        <SwipeProbe
          zone={1}
          name="Zone"
          options={{
            direction: edge === 'left' ? 'right' : 'left',
            from: { edge, within },
          }}
          className={Bottom}
        />
      </LabZone>
    </>
  );
}

const MESSAGES = Array.from({ length: 30 }, (_, i) => `Message ${i + 1}`);

function ScrollStage() {
  return (
    <LabZone n={1} name="Zone" className="flex min-h-0 flex-1 flex-col gap-2">
      <ul
        data-testid="swipe-scroller"
        className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/50 text-sm"
      >
        {MESSAGES.map((message) => (
          <li key={message} className="border-b border-border px-3 py-2">
            {message}
          </li>
        ))}
      </ul>
      <SwipeProbe
        zone={1}
        name="Zone"
        options={{ direction: 'right' }}
        compact
        caption="useSwipe → right, anywhere in Z1"
      />
    </LabZone>
  );
}

function TwoStage() {
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  return (
    <>
      <Controls>
        <Toggle label="← enabled" on={left} onChange={setLeft} />
        <Toggle label="→ enabled" on={right} onChange={setRight} />
      </Controls>
      <LabZone n={1} name="Row" className="flex flex-1 flex-col gap-2">
        <SwipeProbe
          zone={1}
          name="Row"
          options={{ direction: 'left', enabled: left }}
          compact
          caption="useSwipe ← left: show actions"
          className={Bottom}
        />
        <SwipeProbe
          zone={1}
          name="Row"
          options={{ direction: 'right', enabled: right }}
          compact
          caption="useSwipe → right: dismiss"
        />
      </LabZone>
    </>
  );
}

function NestedStage() {
  const [trapped, setTrapped] = useState(false);
  const [row, setRow] = useState(true);
  return (
    <>
      <Controls>
        <Toggle label="trap Z2" on={trapped} onChange={setTrapped} />
        <Toggle label="Z2 swipe" on={row} onChange={setRow} />
      </Controls>
      <LabZone n={1} name="Screen" className="flex flex-1 flex-col gap-2">
        <EdgeBand edge="left" within={40} />
        <LabZone
          n={2}
          name="Row"
          trapped={trapped}
          className="flex min-h-28 flex-1 flex-col"
        >
          <SwipeProbe
            zone={2}
            name="Row"
            options={{ direction: 'right', enabled: row }}
            compact
            caption="Z2 useSwipe → right, anywhere on the row"
            className={Bottom}
          />
        </LabZone>
        <SwipeProbe
          zone={1}
          name="Screen"
          options={{ direction: 'right', from: { edge: 'left', within: 40 } }}
          compact
          caption="Z1 useSwipe → right, from the left edge (40px)"
        />
      </LabZone>
    </>
  );
}

export const SWIPE_CASES: ReadonlyArray<Case> = [
  {
    id: 'one',
    title: 'One Swipe',
    blurb:
      'A Swipe down with the default rule: Commit at release on 80px or 500px/s.',
    touch: false,
    Stage: OneStage,
    guide: {
      try: [
        'Drag down 150px slowly and lift.',
        'Drag down 30px slowly and lift.',
        'Flick down 30px fast.',
        'Drag down 150px, come back up past where you started, and lift.',
      ],
      expect: [
        'The moment a finger lands it is possible. After 10px it locks its axis and is tracking; the arrow follows the finger.',
        'The offset bar fills toward its tick at 80px; the speed bar toward 500px/s. While either is past its tick, the badge reads lift → Commit and the arrow is green.',
        'A long drag Commits. A short, slow one Cancels with short. A short fast flick Commits on speed.',
        'Coming back clamps the offset at 0 instead of cancelling: the Swipe is still yours until you lift. Lifting there Cancels with short.',
        'The last line keeps how the last Swipe ended, with offset, speed and projected: where the momentum would carry it.',
      ],
    },
  },
  {
    id: 'directions',
    title: 'Four directions',
    blurb:
      'One Swipe per zone, each its own way. The first 10px decide the axis.',
    touch: false,
    Stage: DirectionsStage,
    guide: {
      try: [
        'Swipe each zone the way its arrow points.',
        'Swipe the down zone sideways, then upward.',
        'Swipe the down zone at a slant, mostly down.',
      ],
      expect: [
        'Each zone tracks only its own direction.',
        'Sideways or the opposite way Cancels with direction right as its axis would lock, before anything follows the finger.',
        'At a slant, whichever axis moved more in the first 10px wins; after that only the locked direction counts.',
      ],
    },
  },
  {
    id: 'fingers',
    title: 'Finger count',
    blurb:
      'fingers: how many must be down as the axis locks. It decides at the first lift.',
    touch: true,
    Stage: FingersStage,
    guide: {
      try: [
        'With fingers 2, swipe down with one finger.',
        'Swipe down with two fingers together, then lift one.',
        'Swipe down with two fingers and add a third mid-swipe.',
        'Pick 1–3 and try one, two and three fingers.',
      ],
      expect: [
        'One finger where two are asked Cancels with fingers as the axis locks.',
        'Two fingers track together: the offset is their average. The Swipe decides as the first finger lifts, not the last, so lifting unevenly does not matter.',
        'A finger landing after the lock Cancels with fingers: a three-finger touch is not a two-finger Swipe.',
        'Before the lock fingers can land one by one; only the count at the lock counts.',
      ],
    },
  },
  {
    id: 'flick',
    title: 'Flick',
    blurb:
      'commit: { velocity: 800 } and no distance: it Commits on speed alone.',
    touch: false,
    Stage: FlickStage,
    guide: {
      try: [
        'Flick down fast and lift while still moving.',
        'Flick down fast, stop, keep the finger down for a moment, then lift.',
        'Drag down a long way slowly and lift.',
      ],
      expect: [
        'A flick lifted while moving Commits.',
        'Stopping turns the badge back to lift → Cancel within about 100ms, while the finger is still down: speed is measured over the last 100ms, so it falls as you rest. That is the moment to show the flick did not happen.',
        'Distance alone never Commits it: the offset bar has no tick.',
      ],
    },
  },
  {
    id: 'rule',
    title: 'Distance or speed',
    blurb: 'The CommitRule: either part is enough. Turn each off or change it.',
    touch: false,
    Stage: RuleStage,
    guide: {
      try: [
        'With distance 120 and velocity 1200, drag 150px slowly, then flick 40px fast.',
        'Set distance off, then velocity off, and try both again.',
        'Set both off.',
      ],
      expect: [
        'Either tick passed at the lift is a Commit: a slow long drag, or a short fast flick.',
        'With one part off, only the other counts; its bar loses its tick.',
        <>
          With both off, the rule is <Code>commit: {'{}'}</Code> and it never
          Commits: every Swipe ends in Cancel short.
        </>,
      ],
    },
  },
  {
    id: 'edge',
    title: 'From an edge',
    blurb:
      'from: the first finger must land within some px of a screen edge, shown as a band.',
    touch: false,
    Stage: EdgeStage,
    guide: {
      try: [
        'Start inside the band and swipe away from the edge.',
        'Start in the middle and swipe the same way.',
        'Switch the edge and the width.',
      ],
      expect: [
        'From the band it is possible, then tracks like any Swipe.',
        'From outside the band nothing happens: it never becomes possible, so there is no Cancel either. The log still shows the Gesture, since the zone heard it.',
        <>
          The band is measured from the screen, not the zone: this is how a
          sidebar opens only from its edge. <Code>useSidebar</Code> uses it.
        </>,
      ],
    },
  },
  {
    id: 'scroll',
    title: 'Over a scroller',
    blurb:
      'A Swipe right over a list that scrolls. The first movement decides who owns the touch.',
    touch: false,
    Stage: ScrollStage,
    guide: {
      try: [
        'Drag up on the list.',
        'Swipe right across the list.',
        'Scroll back to the top, then drag down on the list.',
      ],
      expect: [
        'Dragging up scrolls the list: the browser keeps a one-finger touch the list can scroll. The Swipe Cancels with interrupted.',
        'Sideways, the list cannot scroll, so the zone takes the touch and the Swipe tracks. Nothing scrolls until you lift.',
        'At the top the list cannot scroll further down, so the zone takes that touch too, and the Swipe Cancels with direction. Pull to refresh builds on this.',
      ],
    },
  },
  {
    id: 'two',
    title: 'Two Swipes, one zone',
    blurb:
      'A row with a Swipe each way, like mail actions. They never know about each other.',
    touch: false,
    Stage: TwoStage,
    guide: {
      try: [
        'Swipe the row left, then right.',
        'Turn one off and swipe its way.',
      ],
      expect: [
        'Both hear every Gesture and both become possible. As the axis locks, the one facing the movement tracks and the other Cancels with direction.',
        <>
          No rule in the package picks between them: their directions do. When
          two could both track, the app keeps them apart with{' '}
          <Code>enabled</Code>, zones and <Code>trapped</Code>.
        </>,
        'Turned off, a Swipe hears nothing: no possible, no Cancel.',
      ],
    },
  },
  {
    id: 'nested',
    title: 'Edge Swipe over a row',
    blurb:
      'A screen that opens a sidebar from its left edge, over a row that swipes right. Both can Commit.',
    touch: false,
    Stage: NestedStage,
    guide: {
      try: [
        'Start on the row near the left edge and swipe right far.',
        'Start on the row in the middle and swipe right.',
        'Trap Z2, or turn its Swipe off, and repeat the first.',
      ],
      expect: [
        'From the edge, the row and the screen both hear the Gesture and both Commit: two meanings from one touch.',
        'From the middle only the row does: the screen’s Swipe wants the edge.',
        'Trapped, Z1 never hears what starts in Z2, so only the row Commits. With the row’s Swipe off, only the screen does. Which one wins is the app’s call, made with these switches.',
      ],
    },
  },
];
