import { useCSSVariable } from 'uniwind';

/**
 * The colour of a glyph on a button, quiet while the button cannot be
 * pressed. Given as a colour, since a button hands its glyphs its own.
 */
export const useToneOf = () => {
  const on = useCSSVariable('--color-foreground');
  const off = useCSSVariable('--color-muted-foreground');
  return (enabled: boolean) => String((enabled ? on : off) ?? '#737373');
};
