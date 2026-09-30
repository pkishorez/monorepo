import { DEPTH, placeholderAt, pageAt, SINK_SHADE } from './geometry.ts';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const TURN = `380ms ${EASE} both`;

const transform = (place: { readonly x: number; readonly scale: number }) =>
  `transform:translateX(${place.x * 100}%) scale(${place.scale})`;
const dim = `filter:brightness(${1 - SINK_SHADE})`;

const turn = (type: string, pseudo: 'old' | 'new') =>
  `html:active-view-transition-type(${type})::view-transition-${pseudo}(page-turn)`;
const darkTurn = (type: string, pseudo: 'old' | 'new') =>
  `html.dark:active-view-transition-type(${type})::view-transition-${pseudo}(page-turn)`;

/**
 * The route view transitions over the Turn Surface's page, named
 * `page-turn`: `turn-next` and `turn-prev` play the same depth a finger drives
 * (geometry.ts), and everything else crossfades. In the dark theme the page
 * further from you dims as it sinks, as it does under a finger. The group is
 * clipped to the surface so a page leaving never slides over the frame.
 */
export const TURN_CSS = `
::view-transition-group(page-turn){animation:none;overflow:clip}
::view-transition-old(page-turn){animation:page-turn-fade-out 120ms ease-out both}
::view-transition-new(page-turn){animation:page-turn-fade-in 220ms ${EASE} both}
${turn('turn-next', 'old')}{animation:page-turn-next-out ${TURN}}
${turn('turn-next', 'new')}{animation:page-turn-next-in ${TURN}}
${turn('turn-prev', 'old')}{z-index:1;animation:page-turn-prev-out ${TURN}}
${turn('turn-prev', 'new')}{animation:page-turn-prev-in ${TURN}}
${darkTurn('turn-next', 'old')}{animation-name:page-turn-next-out-dim}
${darkTurn('turn-prev', 'new')}{animation-name:page-turn-prev-in-dim}
@keyframes page-turn-fade-out{to{opacity:0}}
@keyframes page-turn-fade-in{from{opacity:0}}
@keyframes page-turn-next-out{to{${transform(pageAt('next', 1, DEPTH))}}}
@keyframes page-turn-next-out-dim{to{${transform(pageAt('next', 1, DEPTH))};${dim}}}
@keyframes page-turn-next-in{from{${transform(placeholderAt('next', 0, DEPTH))}}}
@keyframes page-turn-prev-out{to{${transform(pageAt('prev', 1, DEPTH))}}}
@keyframes page-turn-prev-in{from{${transform(placeholderAt('prev', 0, DEPTH))}}}
@keyframes page-turn-prev-in-dim{from{${transform(placeholderAt('prev', 0, DEPTH))};${dim}}}
`;
