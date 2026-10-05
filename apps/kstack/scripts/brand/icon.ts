import { ledgerMark } from './art/index.ts';

/**
 * The home-screen icon: the mark filling the square, since iOS and Android
 * round it themselves. The bars sit inside the middle half, so the same
 * art is safe to mask.
 */
export const iconSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${ledgerMark(size, 'square')}</svg>`;

/** The browser tab's icon: the mark on its tile, drawn at any size. */
export const faviconSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${ledgerMark(32)}</svg>\n`;
