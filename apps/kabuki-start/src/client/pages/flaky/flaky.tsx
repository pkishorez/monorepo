import { Route } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PlaceFrame } from '../../components/index.ts';

/*
 * A client page whose Loader takes a second and then fails half the time.
 * The server sends it loading; Try again is `Router.Retry`, a reload. The
 * failure stays inside its own box.
 */

export const FlakyView = Route.view(Pages.Flaky, ({ props }) => (
  <PlaceFrame
    place="Flaky"
    status={props.status}
    title="Flaky"
    intro="A coin toss in the browser: its data never comes with the page. Heads shows the coin; tails, why it broke, with Try again."
  >
    <Loaded status={props.status} label="Tossing a coin… (a second)" lines={2}>
      {(coin) => (
        <p className="text-lg">
          Heads: the coin came up{' '}
          <span className="font-mono tabular-nums">{coin.luck.toFixed(2)}</span>
          .
        </p>
      )}
    </Loaded>
  </PlaceFrame>
));
