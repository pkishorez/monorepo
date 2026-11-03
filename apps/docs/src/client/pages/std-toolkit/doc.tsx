import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { DocsPage } from '../../components/index.ts';
import { STD_TOOLKIT } from '../../docs/index.ts';

/** One of std-toolkit's docs pages, by its slug. */
export const DocView = View.make(Pages.StdToolkitDocLive, ({ props }) => {
  const { slug } = props.params;
  return <DocsPage id="std-toolkit" slug={slug} page={STD_TOOLKIT[slug]} />;
});
