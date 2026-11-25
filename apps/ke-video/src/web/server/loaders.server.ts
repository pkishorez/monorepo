import { Start } from '@kestack/kabuki/start/server';
import { router } from '../shared/index.ts';

/*
 * No page has a Loader: everything on screen is live, and the browser
 * reads it from `/api` (see `api/`), so the server's pages have no data.
 */

export default Start.server(router.loaders({}));
