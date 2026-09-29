import {
  createFileRoute,
  Link,
  stripSearchParams,
} from '@tanstack/react-router';
import {
  Checklist,
  Code,
  Notice,
  Page,
  Playground,
} from '../components/index.ts';
import {
  SWIPE_DEFAULTS,
  SwipeDemo,
  type SwipeOptions,
  parseSwipe,
  swipeCode,
} from './-demos/index.ts';

// The options live in the URL, so a configured playground is a link.
export const Route = createFileRoute('/gestures/swipe')({
  validateSearch: parseSwipe,
  search: { middlewares: [stripSearchParams(SWIPE_DEFAULTS)] },
  component: Swipe,
});

function Swipe() {
  const options = Route.useSearch();
  const navigate = Route.useNavigate();
  const setOptions = (next: SwipeOptions) =>
    void navigate({ search: next, replace: true, resetScroll: false });
  return (
    <Page
      path="/gestures/swipe"
      testId="scenario-swipe"
      lede={
        <p>
          The Swipe recognizer reads one meaning from a touch: fingers moving
          one way. It follows them live, and at release decides whether it
          counts.
        </p>
      }
    >
      <Playground gestures testId="swipe-playground">
        <SwipeDemo options={options} onOptions={setOptions} />
      </Playground>
      <Code title="Swipe" code={swipeCode(options)} />
      <Notice
        items={[
          'It waits for 10px before choosing an axis, so a wobble never counts. The wrong way first cancels at once.',
          <>
            <code>willCommit</code> is live: the card turns green the moment
            letting go would commit, so the UI can say so before you lift.
          </>,
          <>
            It is judged as the first finger lifts, which is what makes a
            two-finger swipe reliable. The{' '}
            <Link
              to="/gestures/swipe-lab"
              className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              Swipe Lab
            </Link>{' '}
            has every edge case.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Drag the card slowly past 80px and lift: Commit.',
          'Drag 30px slowly and lift: Cancel · short.',
          'Flick 30px fast: Commit on speed alone.',
          'Start the other way: Cancel · direction, before the card moves.',
          'Drag past 80px, come back, and lift: Cancel · short. It decides at release, not at the furthest point.',
          'Set Fingers to 2 and swipe with one finger: Cancel · fingers.',
          'Set Commits on to 500px/s and drag slowly, however far: never a Commit.',
        ]}
      />
    </Page>
  );
}
