import { PHONES, TABLETS } from './devices.ts';

type Device = (typeof PHONES)[number] | (typeof TABLETS)[number];
type Orientation = 'portrait' | 'landscape';

// iOS matches a startup image by the screen's portrait size in points,
// its scale and the way it is held; the image is in pixels, as held.
const screen = (device: Device, tablet: boolean, orientation: Orientation) => {
  const portrait = orientation === 'portrait';
  const width = (portrait ? device.width : device.height) * device.scale;
  const height = (portrait ? device.height : device.width) * device.scale;
  return {
    tablet,
    scale: device.scale,
    width,
    height,
    href: `/splash/${width}x${height}.png`,
    media: `(device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.scale}) and (orientation: ${orientation})`,
  };
};

/** Each Splash image: its size in pixels, where it is served, and the iOS screen it is for. */
export const splashScreens = [
  ...PHONES.map((device) => screen(device, false, 'portrait')),
  ...TABLETS.flatMap((device) => [
    screen(device, true, 'portrait'),
    screen(device, true, 'landscape'),
  ]),
];

/**
 * The tags that give iOS the Splash. iOS shows a startup image only with
 * `apple-mobile-web-app-capable`; the status bar still follows a theme
 * switch, as the theme's StatusBar strip paints the top edge. Android draws
 * its own Splash from the manifest's name, icon and background colour.
 */
export const splashHead = () => ({
  meta: [{ name: 'apple-mobile-web-app-capable', content: 'yes' }],
  links: splashScreens.map((each) => ({
    rel: 'apple-touch-startup-image',
    href: each.href,
    media: each.media,
  })),
});
