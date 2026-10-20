import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../shared/pages/index.ts';
import { Layout, PageIntro } from '../components/index.ts';
import { ApisView } from './apis.tsx';
import { ItemsView } from './items.tsx';
import { StaticView } from './rendering.tsx';

/*
 * The root page's View: the layout, and the one page the URL names. A URL
 * that names no page draws not found, and the server answers 404.
 */

export const AppView = View.make(Pages.AppLive, ({ root, props, children }) => (
  <div {...root}>
    <Layout>
      {props.route.notFound !== null ? (
        <PageIntro title="Nothing here">
          No page at{' '}
          <code className="font-mono text-foreground">
            {props.route.notFound}
          </code>
          , so the server answered 404.{' '}
          <Router.Link
            to={router.Static()}
            className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Start at Rendering
          </Router.Link>
        </PageIntro>
      ) : (
        ((children.Static && <StaticView instance={children.Static} />) ??
        (children.Items && <ItemsView instance={children.Items} />) ??
        (children.Apis && <ApisView instance={children.Apis} />))
      )}
    </Layout>
  </div>
));
