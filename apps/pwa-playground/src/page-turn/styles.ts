const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * The route view transitions over the Turn Surface's page, named
 * `page-turn`: a crossfade by default, and the Page Turn's own depth motion
 * for `turn-next` and `turn-prev` (see history.ts). Only the page moves; the
 * group is clipped to the surface so a page leaving never slides over the
 * frame around it.
 */
export const TURN_CSS = `
::view-transition-group(page-turn){animation:none;overflow:clip}
::view-transition-old(page-turn){animation:page-turn-fade-out 120ms ease-out both}
::view-transition-new(page-turn){animation:page-turn-fade-in 220ms ${EASE} both}
html:active-view-transition-type(turn-next)::view-transition-old(page-turn){animation:page-turn-sink-left 380ms ${EASE} both}
html:active-view-transition-type(turn-next)::view-transition-new(page-turn){animation:page-turn-settle-from-right 380ms ${EASE} both}
html:active-view-transition-type(turn-prev)::view-transition-old(page-turn){z-index:1;animation:page-turn-rise-right 380ms ${EASE} both}
html:active-view-transition-type(turn-prev)::view-transition-new(page-turn){animation:page-turn-come-up-from-left 380ms ${EASE} both}
@keyframes page-turn-fade-out{to{opacity:0}}
@keyframes page-turn-fade-in{from{opacity:0}}
@keyframes page-turn-sink-left{to{transform:translateX(-100%) scale(0.92)}}
@keyframes page-turn-settle-from-right{from{transform:translateX(104%) scale(1.08)}}
@keyframes page-turn-rise-right{to{transform:translateX(100%) scale(1.08)}}
@keyframes page-turn-come-up-from-left{from{transform:translateX(-96%) scale(0.92)}}
`;
