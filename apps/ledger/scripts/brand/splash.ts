import { colors, ledgerMark, ledgerWordmark, poweredBy } from './art/index.ts';

type Screen = {
  readonly tablet: boolean;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
};

// In points; an iPad's are larger, as it is held further away.
const PHONE = { mark: 88, capHeight: 24, footer: 13, footerFromBottom: 56 };
const TABLET = { mark: 112, capHeight: 30, footer: 15, footerFromBottom: 48 };

/**
 * The Splash for one screen, in its pixels: Ledger's mark over its name,
 * a little above the middle, and "Powered by kstack" at the foot, clear of
 * the home indicator.
 */
export const splashSvg = (screen: Screen) => {
  const pt = screen.scale;
  const size = screen.tablet ? TABLET : PHONE;
  const mark = size.mark * pt;
  const gap = size.mark * 0.3 * pt;
  const capHeight = size.capHeight * pt;
  const top = screen.height * 0.46 - (mark + gap + capHeight) / 2;
  const middle = screen.width / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${screen.width}" height="${screen.height}">` +
    `<rect width="100%" height="100%" fill="${colors.background}"/>` +
    `<g transform="translate(${middle - mark / 2} ${top})">${ledgerMark(mark)}</g>` +
    ledgerWordmark(middle, top + mark + gap + capHeight, capHeight) +
    poweredBy(
      middle,
      screen.height - size.footerFromBottom * pt,
      size.footer * pt,
    ) +
    `</svg>`
  );
};
