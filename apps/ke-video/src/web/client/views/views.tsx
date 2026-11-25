import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../shared/index.ts';
import { ListView } from './list/index.ts';
import { Layout } from './parts/index.ts';
import { VideoView } from './video/index.ts';

/*
 * The root page's View: the layout, and in it the list or one Video, as
 * the URL says. A URL that names neither says so.
 */

export const AppView = View.make(Pages.AppLive, ({ root, props, children }) => (
  <div {...root}>
    <Layout>
      {props.route.notFound !== null ? (
        <p className="text-sm text-muted-foreground">
          Nothing at <code className="font-mono">{props.route.notFound}</code>.{' '}
          <Router.Link
            to={router.List()}
            className="text-foreground underline underline-offset-4"
          >
            See every video
          </Router.Link>
        </p>
      ) : (
        ((children.List && <ListView instance={children.List} />) ??
        (children.Video && <VideoView instance={children.Video} />))
      )}
    </Layout>
  </div>
));
