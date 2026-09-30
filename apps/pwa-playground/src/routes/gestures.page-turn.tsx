import { createFileRoute } from '@tanstack/react-router';
import {
  useMotionValueEvent,
  useTransform,
  motion,
} from '@kstackz/ui-toolkit/motion';
import { useState } from 'react';
import {
  Checklist,
  Controls,
  Notice,
  Page,
  Playground,
  Segmented,
  Value,
  Values,
} from '../components/index.ts';
import {
  SIMULATED_LOADS,
  setSimulatedLoad,
  useSimulatedLoad,
} from '../lib/simulated-load.ts';
import { usePageTurnState } from '../page-turn/index.ts';

export const Route = createFileRoute('/gestures/page-turn')({
  component: PageTurns,
});

function Live() {
  const turn = usePageTurnState();
  const [willTurn, setWillTurn] = useState(false);
  useMotionValueEvent(turn.willTurn, 'change', setWillTurn);
  const percent = useTransform(turn.progress, (p) => `${Math.round(p * 100)}%`);
  return (
    <Values>
      <Value label="Phase" testId="turn-phase">
        {turn.phase}
      </Value>
      <Value label="Toward">{turn.to ?? '—'}</Value>
      <Value label="Load" testId="turn-load">
        {turn.load}
      </Value>
      <Value label="Progress">
        <motion.span>{percent}</motion.span>
      </Value>
      <Value label="Will turn">{willTurn ? 'yes' : 'no'}</Value>
    </Values>
  );
}

function PageTurns() {
  const load = useSimulatedLoad();
  return (
    <Page
      path="/gestures/page-turn"
      testId="scenario-page-turn"
      lede={
        <p>
          Swipe sideways and the page follows your finger while the next one
          comes in beside it. Let go past the point where it will turn, and it
          finishes the move straight away, loaded or not: a blank page waits in
          its place until the real one arrives.
        </p>
      }
    >
      <Playground testId="page-turn-playground">
        <Controls>
          <Segmented
            label="Every page loads in"
            value={load}
            options={SIMULATED_LOADS}
            onChange={setSimulatedLoad}
            testId="simulated-load"
          />
        </Controls>
        <Live />
      </Playground>
      <Notice
        items={[
          'The setting holds on every page, so you can turn back and forth through the whole app with slow pages.',
          'A page waiting for its load is still the old address: nothing changes in history until the new page shows.',
          'A load that takes longer than 8 seconds has failed.',
        ]}
      />
      <Checklist
        steps={[
          'Set 2 s. Swipe left a little and let go early. The page springs back.',
          'Swipe left past the point where it will turn and let go. A blank page with a spinner takes its place, then the real page fades in.',
          'Set 5 s. Turn, and while the spinner shows, swipe right. You are back where you were, at once. Wait five seconds: nothing happens.',
          'Turn again straight away. The same load carries on, so it arrives sooner.',
          'Turn, and while it waits, start swiping right but let go early. It goes back to waiting.',
          'Set Fails. Turn, and the blank page says the page did not load. Set Real and press Try again.',
          'Set Hangs. Turn, and wait eight seconds for it to fail.',
          'Turn to the next page, then use the browser Back button. It turns back the same way. Forward turns again.',
          'On a keyboard, press → and ← to turn. Click Next at the foot of the page: it turns the same way.',
          'Open the menu from the left edge while a page waits: the edge still opens the menu.',
        ]}
      />
    </Page>
  );
}
