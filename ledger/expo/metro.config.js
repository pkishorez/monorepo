// Expo's Metro config already handles the pnpm workspace: it watches the
// repo root and follows the isolated node_modules symlinks (SDK 52+). Uniwind
// adds the Tailwind pass over global.css.
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

module.exports = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
