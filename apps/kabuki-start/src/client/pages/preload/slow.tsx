import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, link } from '../../components/index.ts';

/*
 * A slow page's View, in a module of its own: loaded lazily, so a move to
 * the page, or a preload of it, loads this code beside its data.
 */

export default View.make(Pages.SlowLive, ({ props }) => (
  <PlaceFrame place="Preload.Slow" status={props.status}>
    <Loaded
      status={props.status}
      label={`Loading slow page ${props.params.n}… (a second and a half)`}
    >
      {(page) => (
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Slow page {page.n}
          </h2>
          <p className="max-w-prose text-muted-foreground">
            Its Loader takes a second and a half. Preloaded, it was here the
            moment you clicked, and its View's code came with it.
          </p>
          <Router.Link to={router.Preload()} className={`${link} text-sm`}>
            Back to the links
          </Router.Link>
        </div>
      )}
    </Loaded>
  </PlaceFrame>
));
