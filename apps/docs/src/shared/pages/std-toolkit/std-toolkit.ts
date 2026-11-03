import { Page } from '@kestack/kabuki/routing';
import { about, packageOf } from '../../content/index.ts';
import { StdToolkitDoc, StdToolkitDocLive } from './doc.ts';

/** std-toolkit: its landing page when the URL ends here, or a docs page under it. */
export const StdToolkit = Page.define({
  path: '/std-toolkit',
  metadata: about(
    '/std-toolkit',
    'std-toolkit',
    packageOf('std-toolkit').pitch,
  ),
  pages: { Doc: StdToolkitDoc },
});

export const StdToolkitLive = StdToolkit.build({
  pages: { Doc: StdToolkitDocLive },
});
