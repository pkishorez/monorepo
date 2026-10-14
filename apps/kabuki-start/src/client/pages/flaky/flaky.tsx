import { Route } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { Failed, PageFrame, Skeleton } from '../../components/index.ts';

/*
 * A client page whose Loader takes a second and then fails half the time.
 * It draws its own three states with a `switch`: the server sends the first,
 * and Try again is `Router.Retry`, a reload.
 */

export const FlakyView = Route.view(Pages.Flaky, ({ props }) => {
  const { status } = props;
  switch (status._tag) {
    case 'Loading':
      return <Skeleton label="Tossing a coin…" />;
    case 'Failed':
      return <Failed title="Tails: this page broke" reason={status.reason} />;
    case 'Ready':
      return (
        <PageFrame
          place="Flaky"
          data={status.data}
          title="Heads"
          intro={`The coin came up ${status.data.luck.toFixed(2)}: anything from 0.5 is heads. Its data never comes with the page: the server sends it loading, and the browser loads it.`}
        />
      );
  }
});
