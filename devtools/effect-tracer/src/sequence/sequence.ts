export const sequenceAttribute = 'tracer.sequence';

export const tracerAttributePrefix = 'tracer.';

let counter = 0;

export const nextSequence = (): number => counter++;

export const sequenceOrder = (sequence: number): string =>
  sequence.toString().padStart(12, '0');

export const readSequence = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
};
