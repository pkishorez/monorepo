import { Router } from '@kestack/kabuki/routing';
import { Shell } from './shell/index.ts';

/*
 * The router, read down from the root page: every place the app has, and
 * its title when the URL names none.
 */

export const router = Router.define(Shell.page, {
  notFound: { title: 'Not found · code', robots: 'noindex' },
});
