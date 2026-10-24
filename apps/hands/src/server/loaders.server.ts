import { Start } from '@kestack/kabuki/start/server';
import { router } from '../shared/pages/index.ts';

/*
 * No page has data: the server draws the Playground with the camera off,
 * the same for everyone, so it is kept whole.
 */

export default Start.server(router.loaders({}));
