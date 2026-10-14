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
  { to: Routes.About(), url: '/about', what: 'static, no Input' },
  { to: Routes.Blog.Index(), url: '/blog', what: 'static, from a Loader' },
  {
    to: Routes.Docs.Page({ page: 'loaders' }),
    url: '/docs/loaders',
    what: 'two static Loaders at once',
  },
  {
    to: Routes.Docs.Playground(),
    url: '/docs/playground',
    what: 'client under static, a lazy View',
  },
  {
    to: Routes.Account.Settings(),
    url: '/account/settings',
    what: 'dynamic, from your cookie',
  },
  {
    to: Routes.Account.Activity(),
    url: '/account/activity',
    what: 'client under dynamic',
  },
  {
    to: Routes.Dashboard.Overview(),
    url: '/dashboard',
    what: 'client, a lazy View',
  },
  {
    to: Routes.Shop.Cart(),
    url: '/shop/cart',
    what: 'dynamic under static',
  },
] as const;

/** The landing page: static, with no Input, and a tour of the others. */
export const Home = () => (
  <PageFrame
    place="Home"
    title="Every Render Mode, one site"
    intro="Each page here is a place in the Routes, drawn first by the server or by the browser as its Render Mode says. The box under each title says which drew it, when, and where its Input came from."
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
