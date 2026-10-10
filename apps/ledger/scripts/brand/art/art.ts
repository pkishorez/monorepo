import { KE, KSTACK, LEDGER, POWERED_BY, SPACE } from './lettering.ts';
import { INK, MUTED, PAPER } from './palette.ts';

type Word = typeof LEDGER;

/** The colours every piece of art is drawn in. */
export const colors = { background: INK, text: PAPER, muted: MUTED };

const at = (x: number, y: number, svg: string) =>
  `<g transform="translate(${x} ${y})">${svg}</g>`;

const word = (w: Word, size: number, fill: string) =>
  `<path transform="scale(${size / 100})" fill="${fill}" d="${w.d}"/>`;

/**
 * Ledger's mark, `size` square from the top left: three bars, the last one
 * rising, on a tile. `square` drops the tile's corners for icons the system
 * rounds itself.
 */
export const ledgerMark = (size: number, shape: 'tile' | 'square' = 'tile') =>
  `<g transform="scale(${size / 32})">` +
  `<rect width="32" height="32" rx="${shape === 'tile' ? 9 : 0}" fill="${PAPER}"/>` +
  `<rect x="8" y="17" width="4" height="7" rx="2" fill="${INK}"/>` +
  `<rect x="14" y="13" width="4" height="11" rx="2" fill="${INK}"/>` +
  `<rect x="20" y="8" width="4" height="16" rx="2" fill="${INK}"/>` +
  `</g>`;

// kstack's mark, `size` square from the top left: "ke" on a tile cut like
// Ledger's.
const keMark = (size: number) => {
  const fontSize = ((size * 0.6) / (KE.right - KE.left)) * 100;
  const scale = fontSize / 100;
  const x = (size - (KE.right + KE.left) * scale) / 2;
  const y = (size - (KE.bottom + KE.top) * scale) / 2;
  return (
    `<rect width="${size}" height="${size}" rx="${(size * 9) / 32}" fill="${PAPER}"/>` +
    at(x, y, word(KE, fontSize, INK))
  );
};

/** "Ledger" `capHeight` px tall to its capitals, centred on `x`, its baseline on `y`. */
export const ledgerWordmark = (x: number, y: number, capHeight: number) => {
  const fontSize = (capHeight / -LEDGER.top) * 100;
  const left = x - ((LEDGER.left + LEDGER.right) / 2) * (fontSize / 100);
  return at(left, y, word(LEDGER, fontSize, PAPER));
};

/**
 * kstack's mark, then "Powered by kstack", in one line centred on `x` and
 * on `y` across, its text `fontSize` px.
 */
export const poweredBy = (x: number, y: number, fontSize: number) => {
  const scale = fontSize / 100;
  const markSize = fontSize * 1.6;
  const gap = fontSize * 0.6;
  const powered = (POWERED_BY.right - POWERED_BY.left) * scale;
  const kstack = (KSTACK.right - KSTACK.left) * scale;
  const space = SPACE * scale;
  const width = markSize + gap + powered + space + kstack;
  const left = x - width / 2;
  const textLeft = left + markSize + gap;
  const baseline = y - (POWERED_BY.top / 2) * scale;
  return (
    at(left, y - markSize / 2, keMark(markSize)) +
    at(
      textLeft - POWERED_BY.left * scale,
      baseline,
      word(POWERED_BY, fontSize, MUTED),
    ) +
    at(
      textLeft + powered + space - KSTACK.left * scale,
      baseline,
      word(KSTACK, fontSize, PAPER),
    )
  );
};
