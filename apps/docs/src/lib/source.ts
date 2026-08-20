import { loader } from 'fumadocs-core/source';
import { docs } from 'collections/server';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from './shared';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin()],
});

export async function loadSourceData() {
  return {
    pages: Object.fromEntries(
      source.getPages().map((page) => [page.slugs.join('/'), page.path]),
    ),
    pageTree: await source.serializePageTree(source.getPageTree()),
  };
}
