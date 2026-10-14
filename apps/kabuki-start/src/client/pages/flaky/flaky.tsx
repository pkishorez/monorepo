import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { Routes } from '../../../shared/index.ts';
import { Failed, PageFrame, Skeleton } from '../../components/index.ts';

/*
 * A client place whose Loader takes a second and then fails half the time.
 * The server sends its pending screen in the page, the browser loads it,
 * and it shows either the page or its own failed screen, whose link tries
 * again.
 */

const FlakyActor = Actor.make('Flaky', {
  input: Routes.Flaky.input,
  props: Routes.Flaky.props,
  model: Routes.Flaky.input,
}).build({ init: (luck) => ({ model: luck }) });

const FlakyView = View.make(FlakyActor, (self) => (
  <div {...self.root}>
    <PageFrame
      place="Flaky"
      loadedAt={self.model.loadedAt}
      title="Heads"
      intro={`The coin came up ${self.model.luck.toFixed(2)}: anything from 0.5 is heads, and this page loads. Leave and come back to toss again.`}
    />
  </div>
));

export const Flaky = {
  actor: FlakyActor,
  view: FlakyView,
  pending: () => <Skeleton label="Tossing a coin…" />,
  failed: (_props: object, { reason }: { readonly reason: string }) => (
    <Failed title="Tails: this page broke" reason={reason}>
      <Router.Link
        to={Routes.Flaky()}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Try again
      </Router.Link>
    </Failed>
  ),
};
