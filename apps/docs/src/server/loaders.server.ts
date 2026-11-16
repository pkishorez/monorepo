import { Effect } from 'effect';
import { Start } from '@kestack/kabuki/start/server';
import {
  KABUKI_CONTENTS,
  STD_TOOLKIT_CONTENTS,
} from '../shared/content/index.ts';
import { router } from '../shared/pages/index.ts';

/*
 * No page here has data: what a docs page says is in the code. Each docs
 * page's path names a slug, though, and every page of the site is static,
 * so each says the slugs there are, from its table of contents, and the
 * build draws a page for every one. Any other slug is not found.
 */

const loaders = router.loaders({
  'Kabuki.Doc': {
    paths: () =>
      Effect.succeed(KABUKI_CONTENTS.slugs.map((slug) => ({ slug }))),
  },
  'StdToolkit.Doc': {
    paths: () =>
      Effect.succeed(STD_TOOLKIT_CONTENTS.slugs.map((slug) => ({ slug }))),
  },
});

export default Start.server(loaders);
