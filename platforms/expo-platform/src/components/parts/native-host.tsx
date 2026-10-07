/**
 * The host every native control is mounted in, told which appearance to draw.
 *
 * A hosting controller resolves its colour scheme from the trait environment
 * it is placed in, which is the system appearance — not the theme the app is
 * running. Those are the same thing only by coincidence: an app in a dark
 * theme on a phone set to light gets a light platform control beside dark
 * content, and a theme changed at runtime leaves the control where it was,
 * because nothing in the trait environment moved.
 *
 * So the appearance is passed rather than inferred. `colorScheme` is the one
 * theme signal the platform toolkit accepts, and this is the single place it
 * is given.
 *
 * ```tsx
 * const { Host, Switch: NativeSwitch } = nativeUI;
 * <NativeHost host={Host} matchContents ignoreSafeArea="keyboard">
 *   <NativeSwitch value={on} onValueChange={setOn} />
 * </NativeHost>
 * ```
 *
 * ## Why the host arrives as a prop
 *
 * There are two of them. The universal `Host` comes from `getNativeUI()` and
 * the SwiftUI-only one from `getSwiftUI()`, and a caller has already resolved
 * whichever it needs before it renders. Taking the component rather than
 * resolving it again keeps this file free of the module bridge, which is what
 * lets the bridge re-export it without the two importing each other.
 *
 * ## Why this is a component rather than a hook at each call site
 *
 * `useTheme` subscribes to theme changes, and a hook cannot be called
 * conditionally — so reading it inside `Button` would put a subscription on
 * every button in a list for a branch almost none of them take. Here the
 * subscription exists only where a native host is actually mounted.
 */
import type { ComponentType, ReactNode } from 'react';
import { useTheme } from '../../theme';

/**
 * What this renders the host with. A type alias rather than an interface, and
 * that is load-bearing: only an alias gets an implicit index signature, which
 * is what makes it assignable to the bridge's own `Host` prop type.
 */
type NativeHostRenderProps = {
  children?: ReactNode;
  colorScheme?: 'light' | 'dark';
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  ignoreSafeArea?: 'all' | 'container' | 'keyboard';
  style?: unknown;
};

export interface NativeHostProps {
  /**
   * The host component to render — `Host` from `getNativeUI()` for a portable
   * control, or from `getSwiftUI()` for an iOS-only one.
   */
  host: ComponentType<NativeHostRenderProps>;
  children?: ReactNode;
  /** Whether the host resizes itself to the platform content. */
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  /** Which safe areas the host lets the platform inset its content for. */
  ignoreSafeArea?: 'all' | 'container' | 'keyboard';
  style?: unknown;
}

export function NativeHost({ host: Host, children, ...props }: NativeHostProps) {
  const { theme: mode } = useTheme();

  return (
    <Host colorScheme={mode} {...props}>
      {children}
    </Host>
  );
}
