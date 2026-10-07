/**
 * PortalScope: a portal host of its own, inside the app's providers.
 *
 * Overlays (Dialog, Drawer, BottomSheet) render into the nearest portal host.
 * PanelUIProvider's sits at the root, above every provider the app adds, so an
 * overlay opened deep in the app loses the contexts it was written inside: a
 * signed-in User, a router, a store. Wrap the part of the app whose overlays
 * need those contexts in a PortalScope, inside its providers, and its overlays
 * render here instead, still covering the whole scope.
 *
 * ```tsx
 * <SessionProvider session={session}>
 *   <PortalScope>
 *     <Screen />
 *   </PortalScope>
 * </SessionProvider>
 * ```
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PortalHost, PortalProvider } from './parts/portal';

export function PortalScope({ children }: { children: ReactNode }) {
  return (
    <PortalProvider>
      <View className="flex-1">{children}</View>
      <PortalHost />
    </PortalProvider>
  );
}
