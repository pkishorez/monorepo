import Svg, { Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

/**
 * The app's mark: three bars, the last one rising. Drawn in the theme's
 * foreground, or in `inverted` colours where the background is always dark,
 * as on the Splash.
 */
export function LedgerMark(props: {
  readonly size?: number;
  readonly inverted?: boolean;
}) {
  const foreground = useCSSVariable('--color-foreground');
  const background = useCSSVariable('--color-background');
  const tile = props.inverted ? '#fafafa' : String(foreground ?? '#0a0a0a');
  const bars = props.inverted ? '#0a0a0a' : String(background ?? '#ffffff');
  const size = props.size ?? 48;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width="32" height="32" rx="9" fill={tile} />
      <Rect x="8" y="17" width="4" height="7" rx="2" fill={bars} />
      <Rect x="14" y="13" width="4" height="11" rx="2" fill={bars} />
      <Rect x="20" y="8" width="4" height="16" rx="2" fill={bars} />
    </Svg>
  );
}
