import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { AccountSwitcherView } from '@kestack/web-platform/account-switcher';
import { Pages, router } from '../../shared/pages/index.ts';
import { Layout, PageIntro } from '../components/index.ts';
import { ApisView } from './apis.tsx';
import { ItemsView } from './items.tsx';
import { ReplicasAt, ReplicaView } from './replica/index.ts';
import { StaticView } from './rendering.tsx';

/*
 * The root page's View: the layout with the Account Switcher in its
 * header, and the one page the URL names. A URL that names no page draws
 * not found, and the server answers 404. It hands the Replicas it runs
 * down, for the Replica page to show how each Instance syncs.
 */

export const AppView = View.make(Pages.AppLive, ({ root, props, children }) => (
  <ReplicasAt value={children.replicas}>
    <div {...root}>
      <Layout account={<AccountSwitcherView instance={children.account} />}>
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
          (children.Apis && <ApisView instance={children.Apis} />) ??
          (children.Replica && <ReplicaView instance={children.Replica} />))
        )}
      </Layout>
    </div>
  </ReplicasAt>
));
