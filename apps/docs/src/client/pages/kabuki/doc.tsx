import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { DocsPage } from '../../components/index.ts';
import { KABUKI } from '../../docs/index.ts';

/** One of kabuki's docs pages, by its slug. */
export const DocView = View.make(Pages.DocLive, ({ props }) => {
  const { slug } = props.params;
  return <DocsPage id="kabuki" slug={slug} page={KABUKI[slug]} />;
});
