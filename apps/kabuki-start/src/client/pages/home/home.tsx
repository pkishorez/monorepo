import { Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { PageFrame, tile } from '../../components/index.ts';
import { Routes } from '../../../shared/index.ts';

const TOUR = [
  {
    to: Routes.Blog.Index(),
    url: '/blog',
    what: 'open a post: it takes a second, and its pending screen shows inside the blog',
  },
  {
    to: Routes.Blog.Post({ slug: 'broken' }),
    url: '/blog/broken',
    what: "a post whose Loader breaks: the app's failed screen",
  },
  {
    to: Routes.Flaky(),
    url: '/flaky',
    what: 'a client place that fails half the time: its own pending and failed screens',
  },
] as const;

/** The landing page: static, with no Input, and a tour of the slow pages. */
export const Home = () => (
  <PageFrame
    place="Home"
    title="Pending and failed screens"
    intro="A move that loads for more than 150ms lands early and shows its page's pending screen in the page's slot; one whose Loader breaks shows a failed screen there. A quick move shows neither. Every Loader here is slow on purpose."
  >
    <ul className="grid gap-3 sm:grid-cols-2">
      {TOUR.map(({ to, url, what }) => (
        <li key={url}>
          <Router.Link to={to} className={tile}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="font-mono">{url}</CardTitle>
                <CardDescription>{what}</CardDescription>
              </CardHeader>
            </Card>
          </Router.Link>
        </li>
      ))}
    </ul>
  </PageFrame>
);
