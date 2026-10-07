/**
 * Glyph: any Hugeicons drawing, coloured by the theme.
 *
 * `icons.tsx` holds the chrome the components draw with. An app's own icons
 * (its Places, its kinds of things) are glyphs it imports one by one from
 * `@hugeicons/core-free-icons/<Name>`, so Metro bundles only those, and draws
 * here: the colour comes from the prop, then the surface's `IconColorProvider`,
 * then the theme's `tone`.
 *
 * ```tsx
 * import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
 * <Glyph icon={Home01Icon} tone="foreground" />
 * ```
 */
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react-native';
import { useCSSVariable } from 'uniwind';
import { useIconColor } from './icons';

export interface GlyphProps {
  icon: IconSvgElement;
  /** Both dimensions. Default 20. */
  size?: number;
  /** Overrides the inherited colour and the tone. */
  color?: string;
  /** The theme colour used when nothing else gives one. Default `muted-foreground`. */
  tone?: 'foreground' | 'muted-foreground' | 'primary' | 'destructive';
  strokeWidth?: number;
}

export function Glyph({
  icon,
  size = 20,
  color,
  tone = 'muted-foreground',
  strokeWidth = 2,
}: GlyphProps) {
  const inherited = useIconColor();
  const themed = useCSSVariable(`--color-${tone}`);
  const resolved =
    color ?? inherited ?? (typeof themed === 'string' ? themed : '#737373');
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color={resolved}
      strokeWidth={strokeWidth}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
