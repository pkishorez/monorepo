import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import WifiOff01Icon from '@hugeicons/core-free-icons/WifiOff01Icon';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Text } from '@kstackz/expo-toolkit/components/text';
import {
  SidebarProvider,
  useSidebar,
} from '@kstackz/expo-toolkit/patterns/sidebar';
import { keys } from '@ledger/core/client/commands';
import { placeTitle } from '@ledger/core/client/places';
import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '../../ledger';
import { GestureLayer } from './gestures';
import { Globals } from './globals';
import { LedgerSidebar } from './sidebar';

/**
 * Ledger's frame on a phone: the header with the Place's title and the
 * Place, both in the gesture layer, and the Sidebar as a drawer over them.
 */
export function Frame(props: { readonly children: ReactNode }) {
  return (
    <SidebarProvider>
      <View className="flex-1 bg-background">
        <Globals />
        <GestureLayer>
          <Header />
          {props.children}
        </GestureLayer>
      </View>
      <LedgerSidebar />
    </SidebarProvider>
  );
}

// The Sidebar's button, the Place's title, and Offline, quietly.
function Header() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const online = useOnline();
  const run = keys.useRun();
  const { open } = useSidebar();
  return (
    <View
      className="flex-row items-center gap-2 border-b border-border px-2 pb-2"
      style={{ paddingTop: insets.top + 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the sidebar"
        accessibilityState={{ expanded: open }}
        onPress={() => run('toggleSidebar')}
        className="size-11 items-center justify-center rounded-lg active:bg-muted"
      >
        <Glyph icon={Menu01Icon} tone="foreground" />
      </Pressable>
      <Text
        weight="semibold"
        numberOfLines={1}
        accessibilityRole="header"
        className="flex-1 text-base"
      >
        {placeTitle(pathname)}
      </Text>
      {!online && (
        <View className="flex-row items-center gap-1.5 px-2">
          <Glyph icon={WifiOff01Icon} size={14} />
          <Text muted className="text-xs">
            Offline
          </Text>
        </View>
      )}
    </View>
  );
}
