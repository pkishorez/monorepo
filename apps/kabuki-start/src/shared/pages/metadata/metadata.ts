import type { Metadata } from '@kestack/kabuki/routing/page';

/*
 * What a page says about itself to search and to a shared link.
 */

/** Where the site is published: every canonical URL is under it. */
const SITE = 'https://start.kishore.app';

/** A page's Metadata: its title, what it is about, and the one URL it is known by. */
export const about = (
  path: string,
  title: string,
  description: string,
): Metadata => ({
  title: `${title} · Kabuki Start`,
  description,
  canonical: `${SITE}${path}`,
  openGraph: { title, description, url: `${SITE}${path}`, type: 'website' },
});
