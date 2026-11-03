import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { DocView } from './doc.tsx';
import { Landing } from './landing/landing.tsx';

/** std-toolkit's place: the landing page when the URL ends here, or a docs page. */
export const StdToolkitView = View.make(Pages.StdToolkitLive, (self) => {
  const { Doc: doc } = self.children;
  if (!doc) return <Landing />;
  return <DocView instance={doc} />;
});
