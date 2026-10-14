import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PageFrame, link } from '../../components/index.ts';

/*
 * A slow page's View, in a module of its own: loaded lazily, so a move to
 * the page, or a preload of it, loads this code beside its data.
 */

export default View.make(Pages.Slow.actor, ({ props }) => (
  <Loaded
    status={props.status}
    label={`Loading slow page ${props.params.n}… (a second and a half)`}
  >
    {(page) => (
      <PageFrame
        place="Preload.Slow"
        data={page}
        title={`Slow page ${page.n}`}
        intro="Its Loader takes a second and a half. Preloaded, it was here the moment you clicked; its View's code came with it."
      >
        <Router.Link to={Routes.Preload()} className={`${link} text-sm`}>
          Back to the links
        </Router.Link>
      </PageFrame>
    )}
  </Loaded>
));
