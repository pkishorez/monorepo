import type { GestureEvent } from '../recognizers';

/** The measurements worth reading for one gesture, as label/value pairs. */
export const describeGesture = (
  event: GestureEvent,
): ReadonlyArray<readonly [string, string]> => {
  const fields: Array<readonly [string, string]> = [];
  if ('side' in event) fields.push(['side', event.side]);
  if ('direction' in event) {
    fields.push(['dir', event.direction]);
    fields.push(['dist', `${Math.round(event.distance)}px`]);
    fields.push(['vel', `${event.velocity.toFixed(2)}px/ms`]);
  }
  if ('scale' in event) fields.push(['scale', `×${event.scale.toFixed(2)}`]);
  fields.push(['time', `${Math.round(event.duration)}ms`]);
  return fields;
};

export const summarizeGesture = (event: GestureEvent): string =>
  [
    `${event.kind} ${event.phase}`,
    ...describeGesture(event).map(([label, value]) => `${label} ${value}`),
  ].join(' · ');
