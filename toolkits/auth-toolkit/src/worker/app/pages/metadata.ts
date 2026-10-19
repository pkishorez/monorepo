import type { PagesData } from '../api/index.ts';

/** The `<meta>` the server writes when the Auth Worker runs locally: the browser then loads the Kabuki devtools. */
export const DEVTOOLS_META = 'kabuki-devtools';

/**
 * A page's title, after the product's name, and the logo as its icon; with
 * the Auth Worker running locally, the tag that shows the devtools.
 */
export const titled = (title: string) => (data: PagesData | undefined) => ({
  title: data ? `${title} · ${data.brand.name}` : title,
  robots: 'noindex',
  ...(data?.brand.logo
    ? { link: [{ rel: 'icon', href: data.brand.logo }] }
    : {}),
  ...(data?.devtools ? { meta: [{ name: DEVTOOLS_META, content: 'on' }] } : {}),
});
