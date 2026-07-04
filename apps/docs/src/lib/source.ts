import { loader } from 'fumadocs-core/source';
import { docs } from 'collections/server';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from './shared';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin()],
});

/**
 * Serializable docs source data for a fully static deployment: a slug -> content
 * path map plus the serialized page tree. Prerendered to `/api/source` and
 * fetched by the docs route loader on client-side navigation (there is no
 * runtime server to answer a server function).
 */
export async function loadSourceData() {
  return {
    pages: Object.fromEntries(
      source.getPages().map((page) => [page.slugs.join('/'), page.path]),
    ),
    pageTree: await source.serializePageTree(source.getPageTree()),
  };
}
