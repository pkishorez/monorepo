import type { MouseEvent } from 'react';
import { View } from '../../react/index.ts';
import type { ViewOf } from '../../react/view/index.ts';
import type { AnyActor } from '../../core/actor/index.ts';
import type { AnyRoute } from '../capabilities/index.ts';
import { linkOf, linkOptions } from './context.tsx';
import { readyOf, shownOf } from './data.ts';
import { Frame } from './frame.tsx';
import type { RouterMessage, RouterModel, RoutesLike } from './model.ts';
import type { Moves } from './moves.ts';
import { Scrolling } from './scroll/index.ts';
import type { Urls } from './urls.ts';

/*
 * The Router's View: the root page's View inside the Frame and the
 * scroll restoration, with plain clicks on links inside it caught as moves.
 */
export const viewOf = <Route extends AnyRoute>(
  built: AnyActor,
  view: ViewOf<AnyActor>,
  routes: RoutesLike<Route>,
  { href, inside }: Urls<Route>,
  { current, shown }: Moves<Route>,
) => {
  const { scroll: scrolling } = routes.options;
  type Model = RouterModel<Route>;
  const routerView = View.make(built, (self) => {
    const model = self.model as Model;
    const send = self.send as (message: RouterMessage<Route>) => void;
    const onClick = (event: MouseEvent) => {
      const link = linkOf(event);
      if (!link) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      const target = `${url.pathname}${url.search}`;
      // A link to a spot on this page is the browser's to scroll to.
      if (url.hash && target === `${location.pathname}${location.search}`)
        return;
      const within = inside(target);
      if (within === undefined) {
        // Outside the app: the Adapter hands it on; in memory, the browser goes.
        if (!model.attached) return;
        event.preventDefault();
        send({ _tag: 'Left', url: target });
        return;
      }
      event.preventDefault();
      send({
        _tag: 'Pushed',
        route: routes.read(within).route,
        ...linkOptions(link, url),
      });
    };
    const drawn = shown(model);
    // The Metadata follows the data of the pages drawn, not only the move.
    const metadata = routes.metadata(
      drawn,
      readyOf(shownOf(routes, drawn, model.data, model.reload)),
    );
    return (
      <Frame
        drawing={{
          href: href as (route: AnyRoute) => string,
          entries: model.entries,
          at: model.at,
          move: model.move,
          pending: model.pending
            ? {
                to: model.pending.to,
                how:
                  model.pending.how === 'arrive' ? 'push' : model.pending.how,
              }
            : null,
          metadata,
          go: (by) => send({ _tag: 'Went', by }),
          // Only what a reload says: a handler handed an event reloads plainly.
          reload: (options) =>
            send({
              _tag: 'Reloaded',
              ...(options?.anew === true ? { anew: true } : {}),
              ...(options?.hold === true ? { hold: true } : {}),
            }),
          preload: (route) =>
            send({ _tag: 'Preloading', route: route as Route }),
          linkPreload: routes.options.preload,
        }}
        attached={model.attached}
        root={self.root}
        onClick={onClick}
      >
        <Scrolling
          options={scrolling}
          at={{
            route: drawn,
            path: routes.path(drawn),
            key: current(model).key,
          }}
          hash={current(model).hash}
          move={model.move}
          pending={model.pending !== null}
          attached={model.attached}
          loaded={model.loaded}
        >
          {(() => {
            const RootView = view as unknown as ViewOf<AnyActor>;
            return (
              <RootView
                instance={
                  (self.children as { readonly page: { readonly id: string } })
                    .page
                }
              />
            );
          })()}
        </Scrolling>
      </Frame>
    );
  });
  return routerView;
};
