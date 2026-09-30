import { createElement, Fragment } from 'react';
import { THEME_COLORS } from './model.ts';

// An installed iOS web app ignores a theme-color change made in place: it
// tints the status bar from the opaque element at the top edge. This strip is
// that element, above every layer, so a see-through scrim or drawer over the
// top of the app can never change the status bar's color.
const css = `[data-slot="status-bar"]{position:fixed;inset:0 0 auto;z-index:2147483647;pointer-events:none;height:env(safe-area-inset-top);background-color:light-dark(${THEME_COLORS.light},${THEME_COLORS.dark})}@media (display-mode:standalone){[data-slot="status-bar"]{height:max(12px,env(safe-area-inset-top))}}`;

export function StatusBar() {
  return createElement(
    Fragment,
    null,
    createElement('style', null, css),
    createElement('div', { 'aria-hidden': true, 'data-slot': 'status-bar' }),
  );
}
