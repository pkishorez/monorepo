import { View } from '@kestack/kabuki/react';
import { Pages } from '../../shared/pages/index.ts';
import { Layout } from '../components/index.ts';
import { PlaygroundView } from './playground.tsx';

/*
 * The root page's View: the layout, and the Playground, or a note that
 * nothing is at the URL; the server answers that one 404.
 */

export const AppView = View.make(Pages.AppLive, ({ root, props, children }) => (
  <div {...root}>
    <Layout>
      {props.route.notFound !== null || children.Playground === undefined ? (
        <p className="text-muted-foreground">
          Nothing at{' '}
          <code className="font-mono text-foreground">
            {props.route.notFound}
          </code>
          .{' '}
          <a href="/" className="text-foreground underline underline-offset-4">
            Go to the playground
          </a>
        </p>
      ) : (
        <PlaygroundView instance={children.Playground} />
      )}
    </Layout>
  </div>
));
