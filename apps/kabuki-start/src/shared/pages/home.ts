import { Route } from '@kestack/kabuki/routing';
import { about } from '../data/index.ts';

/** The landing page: static, with no data, and a tour of every case. */
export const Home = Route.page({
  path: '/',
  metadata: about(
    '/',
    'Home',
    'Pages as Actors: loading, nested and parallel pages, failures, preloading and reloads.',
  ),
}).build({});
