import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import {
  type Gesture,
  GESTURE_GUIDE,
  type GestureGroup,
  type Motion,
} from '../../../commands/index.ts';
import {
  useChangeSettings,
  useSettings,
} from '../../../state/settings/index.ts';
import { GestureFigure } from './figure.tsx';
import { Row } from './rows.tsx';

// A gesture as it is said: "Thumb Lock, swipe up".
const said = (motion: Motion) => {
  switch (motion.kind) {
    case 'thumb':
      return `Thumb Lock, swipe ${motion.way}`;
    case 'swipe':
      return `Swipe ${motion.way}`;
    case 'drag':
      return `Drag the sheet ${motion.way}`;
    case 'tap':
      return 'Tap';
  }
};

/**
 * Every gesture, Place by Place as they nest, each drawn as it moves. They
 * can't be changed yet, only learned; the Thumb Lock ones turn off with
 * the switch. Their sounds follow General's Sounds.
 */
export function GesturesTab() {
  const settings = useSettings();
  const change = useChangeSettings();
  const on = settings.gesturesOn;
  return (
    <div className="space-y-10">
      <div className="divide-y">
        <Row
          label="Thumb Lock"
          hint="Two-finger commands on a touch screen. Taps, the sidebar swipe and swiping a row to delete always work."
        >
          <Switch
            checked={on}
            onCheckedChange={(gesturesOn) => change({ gesturesOn })}
            aria-label="Thumb Lock"
          />
        </Row>
      </div>

      <section className="flex items-start gap-4 rounded-xl border p-4">
        <GestureFigure
          motion={{ kind: 'thumb', way: 'up' }}
          className="size-16"
        />
        <div className="space-y-1.5 text-sm">
          <h2 className="font-medium">The Thumb Lock</h2>
          <p className="text-pretty text-muted-foreground">
            Rest your left thumb still on the screen, then swipe up or down with
            another finger to Step through Home, Entries, Months and Settings. A
            flick goes one Place; keep going and the top of the screen lists
            them all, for letting go on the one you want. Come back to where you
            began and it goes nowhere. Past either end, or sideways, the screen
            shakes.
          </p>
        </div>
      </section>

      <div className="space-y-8">{GESTURE_GUIDE.map(groupOf)}</div>
    </div>
  );
}

function groupOf(group: GestureGroup) {
  return (
    <div key={group.title} className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground">
        {group.title}
      </h3>
      <ul className="divide-y">{group.gestures.map(rowOf)}</ul>
      {group.inside && (
        <div className="mt-3 space-y-6 border-l pl-4">
          {group.inside.map(groupOf)}
        </div>
      )}
    </div>
  );
}

function rowOf(gesture: Gesture, i: number) {
  return (
    <li key={i} className="flex items-center gap-3 py-2">
      <GestureFigure motion={gesture.motion} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{gesture.does}</span>
        <span className="truncate text-xs text-muted-foreground">
          {said(gesture.motion)}
        </span>
      </span>
    </li>
  );
}
