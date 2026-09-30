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
import { pageTurn } from '../lib/page-turn.ts';

export const Route = createFileRoute('/gestures/page-turn')({
  component: PageTurns,
});

function Live() {
  const turn = pageTurn.usePageTurnState();
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
          comes in beside it, as its own loading screen until it has loaded. Let
          go past the point where it will turn, and it finishes the move
          straight away; the real page takes the loading screen's place as it
          arrives.
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
          'A finger turns the page before it has loaded: the page coming in shows its own loading screen until it has, and the address changes only as it lands.',
          'A link, an arrow key, Back or Forward turns the same way, as a view transition, whichever way history moves: the direction comes from which side of the page you left the other one is.',
          'The setting slows every page but this one, so you can always come back here to change it.',
        ]}
      />
      <Checklist
        steps={[
          'Set 2 s. Swipe left a little and let go early. The page springs back.',
          'Swipe left past the point where it will turn and let go. The next page comes in as its loading screen, then the real page takes its place.',
          'Set 5 s. Turn, and while it loads, swipe right. You are back where you were, at once, and nothing lands later.',
          'Turn again straight away. The same load carries on, so it arrives sooner.',
          'Set Fails. Turn, and the page coming in says it did not load. Swipe back, or turn back to this page from anywhere: it always loads.',
          'Set Hangs. Turn, and wait eight seconds for it to fail.',
          'Click Next at the foot of the page, or press →. The page turns the same way, without a loading screen.',
          'Turn forward twice, back once, then use the browser Back button twice. Each step turns toward where that page sits: forward, then back.',
          'Jump to a page that is not a neighbour from the menu. It crossfades.',
        ]}
      />
    </Page>
  );
}
