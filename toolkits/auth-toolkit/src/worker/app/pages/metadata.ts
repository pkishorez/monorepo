import type { PagesData } from '../api/index.ts';

/** A page's title, after the product's name, and the logo as its icon. */
export const titled = (title: string) => (data: PagesData | undefined) => ({
  title: data ? `${title} · ${data.brand.name}` : title,
  robots: 'noindex',
  ...(data?.brand.logo
    ? { link: [{ rel: 'icon', href: data.brand.logo }] }
    : {}),
});
