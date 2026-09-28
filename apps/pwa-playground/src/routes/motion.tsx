import { createFileRoute } from '@tanstack/react-router';
import { ScenarioPage } from '../components/index.ts';
import { MotionCourse } from './-motion/index.ts';

export const Route = createFileRoute('/motion')({ component: Motion });

function Motion() {
  return (
    <ScenarioPage
      id="motion"
      title="Motion 101: from motion values to momentum"
      proves={
        <>
          <p>
            Framer Motion&apos;s gesture ideas, one at a time: motion values,
            velocity, springs, momentum, bounds, rubber bands, snapping and
            swipes. Every lesson has a live demo, knobs to turn, and the Framer
            Motion code behind it.
          </p>
          <p>
            No math needed. Each demo draws a graph of what moved, so you can
            see a stop, a glide or a bounce instead of reading about it. The
            course ends with real screens: a volume slider, an image slider and
            a map.
          </p>
        </>
      }
    >
      <MotionCourse />
    </ScenarioPage>
  );
}
