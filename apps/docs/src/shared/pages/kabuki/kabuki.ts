import { Page } from '@kestack/kabuki/routing';
import { about, toolkitOf } from '../../content/index.ts';
import { Demo, DemoLive } from './demo.ts';
import { Doc, DocLive } from './doc.ts';

/*
 * kabuki: its landing page when the URL ends here, a docs page under it,
 * or the full-screen demo.
 */

export const Kabuki = Page.define({
  path: '/kabuki',
  metadata: about('/kabuki', 'kabuki', toolkitOf('kabuki').pitch),
  pages: { Doc, Demo },
});

export const KabukiLive = Page.build(Kabuki, {
  pages: { Doc: DocLive, Demo: DemoLive },
});
