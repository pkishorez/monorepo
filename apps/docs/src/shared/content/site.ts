import type { Metadata } from '@kestack/kabuki/routing/page';

/*
 * What the pages say about themselves to search and to a shared link.
 */

/** Where the site is published: every canonical URL is under it. */
const SITE = 'https://docs.kishore.app';

/** The site's name, after every page's title. */
export const NAME = 'ke stack';

/** A page's Metadata: its title, what it is about, and the one URL it is known by. */
export const about = (
  path: string,
  title: string,
  description: string,
): Metadata => ({
  title: `${title} · ${NAME}`,
  description,
  canonical: `${SITE}${path}`,
  openGraph: {
    title,
    description,
    url: `${SITE}${path}`,
    type: 'website',
  },
});
