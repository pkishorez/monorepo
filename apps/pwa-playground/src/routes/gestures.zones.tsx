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
  ZONE_DEFAULTS,
  ZonesDemo,
  type ZoneOptions,
  parseZones,
  zonesCode,
} from './-demos/index.ts';

// The options live in the URL, so a configured playground is a link.
export const Route = createFileRoute('/gestures/zones')({
  validateSearch: parseZones,
  search: { middlewares: [stripSearchParams(ZONE_DEFAULTS)] },
  component: Zones,
});

function Zones() {
  const options = Route.useSearch();
  const navigate = Route.useNavigate();
  const setOptions = (next: ZoneOptions) =>
    void navigate({ search: next, replace: true, resetScroll: false });
  return (
    <Page
      path="/gestures/zones"
      testId="scenario-zones"
      lede={
        <p>
          Zones decide who hears a touch. The first finger lands in the
          innermost zone, and the touch travels outward through every zone
          around it, stopping at the first trapped one.
        </p>
      }
    >
      <Playground gestures testId="zones-playground">
        <ZonesDemo options={options} onOptions={setOptions} />
      </Playground>
      <Code title="Zones" code={zonesCode(options)} />
      <Notice
        items={[
          'The first finger decides who hears the whole touch. Later fingers join it wherever they land.',
          <>
            <code>trapped</code> stops the walk outward. This playground is
            itself a trapped zone, which is why the app’s page swipe never fires
            here.
          </>,
          <>
            The core never says what a touch means. It reports every finger as
            motion values, and the{' '}
            <Link
              to="/gestures/lab"
              className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              Gesture Lab
            </Link>{' '}
            logs each one.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Touch the Row: Row, List and Screen all light up.',
          'Touch the List outside the Row: List and Screen light up, never Row.',
          'Trap Row and touch it: only Row lights up.',
          'Trap List and touch the Row: Row and List light up, Screen does not.',
          'Put one finger on the Row and a second on the Screen: the second joins the same Gesture, and fingers reads 2.',
        ]}
      />
    </Page>
  );
}
