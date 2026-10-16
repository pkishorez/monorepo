import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, link, useNow } from '../../components/index.ts';

/*
 * A slow page's View, in a module of its own: loaded lazily, so a move to
 * the page, or a preload of it, loads this code beside its data. It shows
 * its Stale time at work: how many times its Loader has run, and how long
 * its data stays fresh, from its `status.info.freshUntil`. Back to it while
 * fresh loads nothing, so the count stays; once stale, it is shown
 * refreshing and the count goes up.
 */

function Freshness({ until }: { readonly until: number }) {
  const now = useNow();
  if (now === 0) return null;
  const left = Math.floor((until - now) / 1000);
  return left > 0 ? (
    <>
      fresh for <span className="font-mono text-foreground">{left} s</span>:
      come back now and nothing loads.
    </>
  ) : (
    <>stale: come back and it shows this while it loads again.</>
  );
}

export default View.make(Pages.SlowLive, ({ props }) => {
  const { status } = props;
  return (
    <PlaceFrame
      place="Preload.Slow"
      title={`Slow page ${props.params.n}`}
      status={props.status}
    >
      <Loaded
        status={props.status}
        label={`Loading slow page ${props.params.n}… (1.5 s)`}
      >
        {(page) => (
          <div className="space-y-4 text-sm">
            <dl className="grid max-w-md grid-cols-[8rem_1fr] gap-y-2">
              <dt className="text-muted-foreground">Loader ran</dt>
              <dd className="font-mono">
                {page.loads} {page.loads === 1 ? 'time' : 'times'}
              </dd>
              <dt className="text-muted-foreground">Its data is</dt>
              <dd className="text-muted-foreground">
                {status._tag === 'Ready' && status.info.freshUntil !== null && (
                  <Freshness until={status.info.freshUntil} />
                )}
              </dd>
            </dl>
            <Router.Link to={router.Preload()} className={link}>
              Back to the links
            </Router.Link>
          </div>
        )}
      </Loaded>
    </PlaceFrame>
  );
});
