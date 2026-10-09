import { createFileRoute } from '@tanstack/react-router';
import { Embedding } from '@/demos/effect-oak/embedding';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/*
 * The Shell runs the host page, not the widget: the demo makes its own app
 * with `toReact`, because the host mounts the widget into its own element.
 */
export const Route = createFileRoute('/demos/effect-oak/embedding')({
  component: () => <Shell app={Embedding} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
