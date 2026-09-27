import { useMemo } from 'react';
import type { ZoneSource } from '../../provider';
import { CanvasLayer } from '../canvas';
import { createFingerPainter } from './paint';

/**
 * The zone's fingers, drawn by role over the page. Colours are custom
 * properties on the layer, set from kui tokens.
 */
export function FingerLayer(props: {
  readonly source: ZoneSource;
  readonly tapFeedback?: boolean;
}) {
  const paint = useMemo(
    () =>
      createFingerPainter(props.source, {
        tapFeedback: props.tapFeedback,
      }),
    [props.source, props.tapFeedback],
  );
  return (
    <CanvasLayer
      source={props.source}
      paint={paint}
      testId="gesture-fingers"
      className="z-40 [--gf-acting:var(--color-chart-9)] [--gf-hold:var(--color-chart-8)] [--gf-chip-text:var(--color-popover-foreground)] [--gf-chip:var(--color-popover)] [--gf-dim:var(--color-background)] [--gf-ring:var(--color-foreground)]"
    />
  );
}
