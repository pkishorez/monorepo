import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Slider } from '@kstackz/ui-toolkit/components/ui/slider';
import { motion } from '@kstackz/ui-toolkit/motion';
import { type ReactNode, useContext, useRef, useState } from 'react';
import { Code, Controls, Toggle } from './controls.tsx';
import type { Guide } from './panel.tsx';
import { LaneContext, useLabStore } from './store.ts';
import { LabProvider, LabZone, NoZone } from './zone.tsx';

function FingersStage() {
  return <LabZone n={1} name="Zone" className="flex-1" />;
}

function NestingStage() {
  return (
    <LabZone n={1} name="Screen" className="flex flex-1 flex-col">
      <LabZone n={2} name="List" className="flex flex-1 flex-col">
        <LabZone n={3} name="Card" className="h-2/3" />
      </LabZone>
    </LabZone>
  );
}

function TrappedStage() {
  const [list, setList] = useState(false);
  const [card, setCard] = useState(true);
  return (
    <>
      <Controls>
        <Toggle label="trap Z2" on={list} onChange={setList} />
        <Toggle label="trap Z3" on={card} onChange={setCard} />
      </Controls>
      <LabZone n={1} name="Screen" className="flex flex-1 flex-col">
        <LabZone
          n={2}
          name="List"
          trapped={list}
          className="flex flex-1 flex-col"
        >
          <LabZone n={3} name="Card" trapped={card} className="h-2/3" />
        </LabZone>
      </LabZone>
    </>
  );
}

function SiblingsStage() {
  return (
    <>
      <LabZone
        n={1}
        name="Screen"
        className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-2"
      >
        <LabZone n={2} name="Card A" />
        <LabZone n={3} name="Card B" />
      </LabZone>
      <NoZone className="h-24 shrink-0" />
    </>
  );
}

function EnabledStage() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <>
      <Controls>
        <Toggle label="Z1 hook" on={outer} onChange={setOuter} />
        <Toggle label="Z2 hook" on={inner} onChange={setInner} />
      </Controls>
      <LabZone
        n={1}
        name="Screen"
        hook={outer}
        className="flex flex-1 flex-col"
      >
        <LabZone n={2} name="Card" hook={inner} className="h-2/3" />
      </LabZone>
    </>
  );
}

const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);
const CHIPS = Array.from({ length: 16 }, (_, i) => `chip ${i + 1}`);

function ScrollingStage() {
  return (
    <LabZone
      n={1}
      name="Zone"
      className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-2"
    >
      <div className="flex min-h-0 flex-col gap-1">
        <span className="font-mono text-[11px] text-muted-foreground">
          scrolls up and down
        </span>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background ring-1 ring-border">
          {ROWS.map((row) => (
            <div key={row} className="border-b border-border px-3 py-2 text-sm">
              {row}
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          scrolls sideways
        </span>
        <div className="flex shrink-0 gap-1.5 overflow-x-auto rounded-lg bg-background p-2 ring-1 ring-border">
          {CHIPS.map((chip) => (
            <span
              key={chip}
              className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs"
            >
              {chip}
            </span>
          ))}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          data-zone-gesture="enabled"
        </span>
        <div
          data-zone-gesture="enabled"
          className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background ring-2 ring-foreground/40"
        >
          {ROWS.map((row) => (
            <div key={row} className="border-b border-border px-3 py-2 text-sm">
              {row}
            </div>
          ))}
        </div>
      </div>
    </LabZone>
  );
}

function DisabledStage() {
  const [value, setValue] = useState(40);
  const bounds = useRef<HTMLDivElement>(null);
  return (
    <LabZone n={1} name="Zone" className="flex flex-1 flex-col gap-3">
      <div
        data-zone-gesture="disabled"
        className="flex flex-col gap-2 rounded-lg bg-background p-3 ring-2 ring-muted-foreground/40 ring-dashed"
      >
        <span className="font-mono text-[11px] text-muted-foreground">
          slider · data-zone-gesture="disabled" ·{' '}
          <span className="inline-block w-[3ch] tabular-nums">{value}</span>
        </span>
        <Slider
          value={value}
          min={0}
          max={100}
          onValueChange={(next) =>
            setValue(Array.isArray(next) ? (next[0] ?? 0) : next)
          }
        />
      </div>
      <div
        ref={bounds}
        className="relative min-h-0 flex-1 rounded-lg bg-background ring-1 ring-border"
      >
        <span className="absolute top-2 left-3 font-mono text-[11px] text-muted-foreground">
          Motion drag · data-zone-gesture="disabled"
        </span>
        <motion.div
          drag
          dragConstraints={bounds}
          dragMomentum={false}
          data-zone-gesture="disabled"
          className="absolute top-10 left-4 flex size-20 cursor-grab touch-none items-center justify-center rounded-xl bg-foreground text-xs font-medium text-background shadow-lg active:cursor-grabbing"
        >
          drag me
        </motion.div>
      </div>
    </LabZone>
  );
}

function ClicksStage() {
  const store = useLabStore();
  const lane = useContext(LaneContext);
  const [prevent, setPrevent] = useState(false);
  const [clicks, setClicks] = useState(0);
  return (
    <>
      <Controls>
        <Toggle label="preventClick()" on={prevent} onChange={setPrevent} />
      </Controls>
      <LabZone
        n={1}
        name="Zone"
        onEnd={(_pointers, end) => {
          if (!prevent) return;
          end.preventClick();
          store.note(lane, ['onEnd called preventClick().']);
        }}
        className="flex flex-1 items-center justify-center"
      >
        <Button
          size="lg"
          className="h-20 w-48 text-base tabular-nums"
          onClick={() => {
            setClicks((n) => n + 1);
            store.note(lane, ['The button got a click.']);
          }}
        >
          Clicked {clicks}×
        </Button>
      </LabZone>
    </>
  );
}

const PARAGRAPHS = Array.from(
  { length: 8 },
  (_, i) =>
    `Paragraph ${i + 1}. This part of the page is in no zone, so the browser owns every touch here: it scrolls, selects and clicks as on any page.`,
);

function OutsideStage() {
  return (
    <>
      <LabZone n={1} name="Zone" className="h-2/5 shrink-0" />
      <NoZone className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed">
          {PARAGRAPHS.map((text) => (
            <p key={text} className="mb-3">
              {text}
            </p>
          ))}
        </div>
      </NoZone>
    </>
  );
}

function ProvidersStage() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-2">
      <LabProvider lane="A">
        <LabZone n={1} name="Provider A" className="flex flex-col">
          <LabZone n={2} name="Card" className="h-1/2" />
        </LabZone>
      </LabProvider>
      <LabProvider lane="B">
        <LabZone n={1} tone={4} name="Provider B" className="flex flex-col">
          <LabZone n={2} tone={5} name="Card" className="h-1/2" />
        </LabZone>
      </LabProvider>
    </div>
  );
}

export type Case = {
  readonly id: string;
  readonly title: string;
  /** One line, under the picker. */
  readonly blurb: string;
  /** Needs more than one finger to see it all. */
  readonly touch: boolean;
  readonly guide: Guide;
  readonly Stage: () => ReactNode;
};

export const CASES: ReadonlyArray<Case> = [
  {
    id: 'fingers',
    title: 'Fingers',
    blurb:
      'One zone. Every finger of a Gesture, from the first landing to the last lifting.',
    touch: true,
    Stage: FingersStage,
    guide: {
      try: [
        'Put one finger down, move it around, lift it.',
        'Put three fingers down one at a time. Lift finger 2, keep the others down, then add another.',
        'Open the Fingers tab while you do it.',
      ],
      expect: [
        'The Gesture starts as finger 1 lands and ends as the last finger lifts. Every finger in between is part of it.',
        'Fingers are numbered in the order they landed. start.t is ms after finger 1 landed.',
        'A lifted finger stays in the Gesture, frozen where it lifted, until the Gesture ends. Its number is not reused.',
        <>
          Nothing is classified: no tap, pan or pinch. <Code>useGesture</Code>{' '}
          reports fingers; what they mean is your app’s call.
        </>,
      ],
    },
  },
  {
    id: 'nesting',
    title: 'Nested zones',
    blurb:
      'A Gesture is heard by the zone it starts in and each zone around it.',
    touch: false,
    Stage: NestingStage,
    guide: {
      try: [
        'Touch Z3 Card.',
        'Touch Z2 List outside the card.',
        'Touch Z1 Screen outside the list.',
      ],
      expect: [
        'On the card: Z3, Z2 and Z1 all hear it. The walk goes from the innermost zone outwards.',
        'On the list: Z2 and Z1 hear it. Z3 does not: zones inside the one you touched never hear.',
        'On the screen: only Z1.',
        'The log’s Walk line lists the zones in order.',
      ],
    },
  },
  {
    id: 'trapped',
    title: 'Trapped',
    blurb:
      'A trapped zone keeps the Gestures that start in it from the zones around it.',
    touch: false,
    Stage: TrappedStage,
    guide: {
      try: [
        'With Z3 trapped, touch Z3 Card.',
        'Turn Z3’s trap off and touch it again.',
        'Trap Z2 instead, and touch Z3.',
      ],
      expect: [
        'Trapped Z3: only Z3 hears. The trapped zone still hears; the walk just stops there.',
        'Untrapped: Z3, Z2 and Z1 all hear.',
        'Z2 trapped: Z3 and Z2 hear, Z1 does not.',
        <>
          <Code>trapped</Code> is read as each Gesture starts, so it can follow
          your app’s state, such as{' '}
          <Code>
            trapped={'{'}optionsOpen{'}'}
          </Code>
          . Flipping it mid-Gesture changes the next Gesture only.
        </>,
      ],
    },
  },
  {
    id: 'siblings',
    title: 'Siblings and later fingers',
    blurb:
      'Later fingers join the Gesture wherever they land; sibling zones never hear it.',
    touch: true,
    Stage: SiblingsStage,
    guide: {
      try: [
        'Put finger 1 on Z2 Card A.',
        'Keep it down and put finger 2 on Z3 Card B.',
        'Keep both down and put finger 3 in the no-zone strip.',
        'Lift everything, then start on Card B instead.',
      ],
      expect: [
        'All three fingers are one Gesture. Finger 1 decided who hears: Z2 and Z1.',
        'Z3 never lights: finger 2 joins finger 1’s Gesture, and who hears it does not change.',
        'Finger 3 joins too, dashed because it landed outside every zone.',
        'Started on Card B: Z3 and Z1 hear, Z2 does not. Siblings never hear each other.',
      ],
    },
  },
  {
    id: 'enabled',
    title: 'Enabled hooks',
    blurb:
      'A hook that is not enabled skips a Gesture; its zone still passes it up.',
    touch: false,
    Stage: EnabledStage,
    guide: {
      try: [
        'Touch Z2 Card with both hooks on.',
        'Turn the Z2 hook off and touch Z2 Card again.',
        'Hold a finger on the card and, with another finger, turn Z1’s hook off. Lift, then touch again.',
        'Turn both hooks off and touch the card.',
      ],
      expect: [
        'Both on: Z2 and Z1 hear.',
        'Z2 off: only Z1 hears. The walk still goes through Z2; its hook just skips this Gesture.',
        <>
          <Code>enabled</Code> is read as each Gesture starts: flipping it
          mid-Gesture changes nothing until the next one. The switches are
          marked <Code>data-zone-gesture="disabled"</Code>, so that second
          finger does not join the Gesture.
        </>,
        'Both off: the zone still holds the browser back, but no hook hears. The finger shows as ×.',
      ],
    },
  },
  {
    id: 'scrolling',
    title: 'Scrolling in a zone',
    blurb:
      'A scroller keeps the touches it can scroll; the zone takes the rest.',
    touch: true,
    Stage: ScrollingStage,
    guide: {
      try: [
        'Drag the left list up and down with one finger.',
        'Drag the left list sideways.',
        'Scroll the left list to the top, then drag down.',
        'Drag the left list with two fingers.',
        'Swipe the chips sideways, then drag the enabled list at the bottom right.',
      ],
      expect: [
        'Up and down: the list scrolls. The browser took the touch, so the Gesture ends interrupted.',
        'Sideways: the list cannot scroll that way, so the zone keeps the touch.',
        'At the top, dragging down: it cannot scroll further, so the zone keeps it. This is where a pull-to-refresh lives.',
        'Two fingers: the zone’s. A scroller only keeps a one-finger touch.',
        <>
          The chips scroll sideways like the list scrolls up and down. The list
          marked <Code>data-zone-gesture="enabled"</Code> never scrolls: the
          zone takes every touch there. The browser decides at the first
          movement.
        </>,
      ],
    },
  },
  {
    id: 'disabled',
    title: 'Disabled elements',
    blurb:
      'An element marked disabled keeps its own touches: a slider, a Motion drag.',
    touch: true,
    Stage: DisabledStage,
    guide: {
      try: [
        'Move the slider.',
        'Drag the card.',
        'Put a finger on the zone’s empty space, then move the slider with another finger.',
      ],
      expect: [
        'The slider and the card work as their own: no Gesture starts, and the finger shows as ×.',
        'A finger landing on a disabled element never joins a Gesture either, so the slider moves while the Gesture goes on without it.',
        <>
          Mark any element that uses Motion’s own <Code>drag</Code>,{' '}
          <Code>whileTap</Code> or <Code>onPan</Code> as{' '}
          <Code>data-zone-gesture="disabled"</Code>; otherwise one touch gets
          two reactions.
        </>,
      ],
    },
  },
  {
    id: 'clicks',
    title: 'Clicks',
    blurb: 'The browser decides if a Gesture clicks; your app can stop it.',
    touch: true,
    Stage: ClicksStage,
    guide: {
      try: [
        'Tap the button.',
        'Press the button and slide off before lifting.',
        'Tap it with two fingers at once.',
        'Hold a finger in the zone, tap the button with another, then lift the first.',
        'Turn preventClick() on and tap the button.',
      ],
      expect: [
        'A tap clicks, as on any page. The log shows the click after the Gesture ends.',
        'A touch that moved, or used two fingers, is not a click to the browser.',
        'A finger lifting while others stay down never clicks.',
        <>
          With <Code>preventClick()</Code> in <Code>onEnd</Code>, nothing is
          clicked: call it when your app acted on the Gesture. With a mouse, a
          drag released on the button still clicks unless you prevent it.
        </>,
      ],
    },
  },
  {
    id: 'outside',
    title: 'Outside every zone',
    blurb: 'Where no zone is, nothing here runs and the page behaves as usual.',
    touch: true,
    Stage: OutsideStage,
    guide: {
      try: [
        'Scroll the text in the no-zone part.',
        'Put a finger in Z1, keep it down, and try to scroll the text with another finger.',
      ],
      expect: [
        'Alone, the text scrolls as on any page. No Gesture, nothing in the log.',
        'With a Gesture under way, the second finger joins it, dashed. While a Gesture runs nothing scrolls: the browser treats every finger on the screen as one touch.',
        'That second part is worth checking on each phone: it is the least certain behavior of the block.',
      ],
    },
  },
  {
    id: 'providers',
    title: 'Two providers',
    blurb:
      'Each Gesture Provider runs its own Gesture; two hands make two Gestures.',
    touch: true,
    Stage: ProvidersStage,
    guide: {
      try: [
        'Put one finger in provider A and, at the same time, one in provider B.',
        'Start in A’s card, then put a second finger in B.',
      ],
      expect: [
        'Two Gestures at once, numbered A1… and B1…, each heard only by its own provider’s zones.',
        'A finger landing in another provider’s zone never joins: it starts that provider’s Gesture instead.',
        'Within one provider there is one Gesture at a time. Usually one provider at the root is all an app needs.',
      ],
    },
  },
];

export type CaseId = string;

/** The Case `value` names in `cases`, or the first. */
export const parseCase = (cases: ReadonlyArray<Case>, value: unknown): CaseId =>
  cases.find((c) => c.id === value)?.id ?? (cases[0] as Case).id;

export const caseOf = (cases: ReadonlyArray<Case>, id: CaseId) =>
  cases.find((c) => c.id === id) ?? (cases[0] as Case);
