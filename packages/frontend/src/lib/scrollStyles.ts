import { cn } from '../lib/utils';

const baseStyles = cn(
  'pointer-fine:[&::-webkit-scrollbar-track]:bg-transparent',
  'pointer-fine:[&::-webkit-scrollbar-thumb]:bg-foreground/20',
  'pointer-fine:[&::-webkit-scrollbar-thumb]:rounded-full',
  'pointer-fine:[&::-webkit-scrollbar-thumb]:border-2',
  'pointer-fine:[&::-webkit-scrollbar-thumb]:border-transparent',
  'pointer-fine:[&::-webkit-scrollbar-thumb:hover]:bg-foreground/30',
  'pointer-fine:[&::-webkit-scrollbar-corner]:bg-transparent',
);
/**
 * Returns custom scrollbar styling classes for webkit browsers.
 * Uses pointer-fine media query to only apply on devices with precise pointing (desktop).
 *
 * @returns String of Tailwind classes for custom scrollbars
 */
export const scrollbarStyles = cn(
  baseStyles,
  'pointer-fine:[&::-webkit-scrollbar]:h-2',
  'pointer-fine:[&::-webkit-scrollbar]:w-2',
);

export const scrollBar = (
  variant: 'default' | 'small' | 'none',
  { direction = 'both' }: { direction: 'both' | 'vertical' | 'horizontal' } = {
    direction: 'both',
  },
) =>
  cn(baseStyles, {
    [cn(
      (direction === 'vertical' || direction === 'both') &&
        'pointer-fine:[&::-webkit-scrollbar]:h-0.5',
      (direction === 'horizontal' || direction === 'both') &&
        'pointer-fine:[&::-webkit-scrollbar]:w-0.5',
    )]: variant === 'small',
    'pointer-fine:[&::-webkit-scrollbar]:hidden': variant === 'none',
    [cn(
      (direction === 'vertical' || direction === 'both') &&
        'pointer-fine:[&::-webkit-scrollbar]:h-2',
      (direction === 'horizontal' || direction === 'both') &&
        'pointer-fine:[&::-webkit-scrollbar]:w-2',
    )]: variant === 'default',
  });
