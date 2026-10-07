import { mkdir, rm, writeFile } from 'node:fs/promises';
import { splashScreens } from '@kstackz/web-toolkit/pwa/splash';
import { faviconSvg, iconSvg } from './icon.ts';
import { png } from './png.ts';
import { splashSvg } from './splash.ts';

const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

/**
 * Draws all of Ledger's art into `publicDir`: the tab's icon, the
 * home-screen icons the manifest names, and a Splash for every iOS screen.
 */
export const writeBrand = async (publicDir: URL) => {
  await writeFile(new URL('favicon.svg', publicDir), faviconSvg());

  for (const icon of ICONS) {
    await writeFile(
      new URL(`icons/${icon.file}`, publicDir),
      await png(iconSvg(icon.size)),
    );
  }

  const splashDir = new URL('splash/', publicDir);
  await rm(splashDir, { recursive: true, force: true });
  await mkdir(splashDir);
  for (const screen of splashScreens) {
    await writeFile(
      new URL(`.${screen.href}`, publicDir),
      await png(splashSvg(screen)),
    );
  }
};
