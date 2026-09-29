import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Checklist,
  Code,
  Notice,
  Page,
  Playground,
} from '../components/index.ts';
import { PULL_DEFAULTS, PullDemo, pullCode } from './-demos/index.ts';

export const Route = createFileRoute('/gestures/pull-to-refresh')({
  component: PullToRefresh,
});

function PullToRefresh() {
  const [options, setOptions] = useState(PULL_DEFAULTS);
  return (
    <Page
      path="/gestures/pull-to-refresh"
      testId="scenario-pull-to-refresh"
      lede={
        <p>
          Pull the list down from its top. It resists more the further you go,
          arms past a distance, and holds while the refresh runs.
        </p>
      }
    >
      <Playground gestures testId="pull-playground">
        <PullDemo options={options} onOptions={setOptions} />
      </Playground>
      <Code title="Pull to refresh" code={pullCode(options)} />
      <Notice
        items={[
          'Only distance counts, never speed: a quick flick down will not refresh by accident.',
          'A list that can still scroll up keeps the touch. The pull starts only once it is at its top.',
          'This app pulls the same way: on a phone, pull any page down from its top to reload its data.',
        ]}
      />
      <Checklist
        steps={[
          'With the list at its top, pull down slowly a little, then let go. It springs back and nothing happens.',
          'Pull far, until the label reads Release to refresh, then let go. It holds with a spinner, a new message arrives on top, and it springs back.',
          'Pull until it is armed, push back up a bit, then let go. Nothing happens.',
          'Pull again while it is still refreshing. Nothing happens until it ends.',
          'Flick down a short way, fast. It does not refresh.',
          'Scroll the list down, then drag down to scroll back, and keep dragging past the top. It only scrolls: the list owned that touch.',
          'Lift, and pull down again from the top. Now it pulls.',
          'Pull with two fingers. It does not pull: it is a one-finger Swipe.',
          'Change the distance and the refresh time, and turn it off.',
        ]}
      />
    </Page>
  );
}
