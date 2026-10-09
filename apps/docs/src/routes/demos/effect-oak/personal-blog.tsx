import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  PersonalBlog,
  PersonalBlogLive,
  PersonalBlogView,
} from '@/demos/effect-oak/personal-blog';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Location: the path after the `#`. */
const App = toReact(PersonalBlog, PersonalBlogView, PersonalBlogLive);

export const Route = createFileRoute('/demos/effect-oak/personal-blog')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
