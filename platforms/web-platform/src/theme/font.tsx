import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';

/*
 * Inter in the head, so text never moves when it arrives. `font-inter.css`
 * declares Inter from Fontsource with `font-display: swap`; on its own, the
 * first paint is in another font and every line reflows once Inter lands.
 * Two things stop that:
 *
 * 1. Preload  this tag asks for Inter's Latin file before the stylesheets
 *             are read, so on most connections it is there before the
 *             first paint. It names the very file `font-inter.css` uses:
 *             the app's bundler gives both one URL.
 * 2. Fallback `font-inter.css` also declares `Inter Fallback`, the local
 *             Arial sized to Inter's metrics, and the Theme's sans family
 *             names it next; a late swap changes the letters' shapes, but
 *             moves nothing.
 */

/** Preloads Inter's Latin file: put it in the Document's `<head>`, beside `font-inter.css`. */
export function FontPreload() {
  return (
    <link
      rel="preload"
      href={interLatin}
      as="font"
      type="font/woff2"
      crossOrigin=""
    />
  );
}
