import { useState } from 'react';
import { CanvasLayer, type ZoneSource } from '../layer';
import { createFingerPainter } from './paint';

/**
 * The zone's fingers, drawn by role over the page. Colours are custom
 * properties on the layer, set from kui tokens.
 */
export function FingerLayer(props: { readonly source: ZoneSource }) {
  const [paint] = useState(() => createFingerPainter(props.source));
  return (
    <CanvasLayer
      source={props.source}
      paint={paint}
      testId="gesture-fingers"
      className="z-40 [--gf-acting:var(--color-chart-9)] [--gf-anchor:var(--color-chart-8)] [--gf-chip-text:var(--color-popover-foreground)] [--gf-chip:var(--color-popover)] [--gf-dim:var(--color-background)] [--gf-ring:var(--color-foreground)]"
    />
  );
}
