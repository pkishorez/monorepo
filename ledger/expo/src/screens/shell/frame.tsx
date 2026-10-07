import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import WifiOff01Icon from '@hugeicons/core-free-icons/WifiOff01Icon';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Text } from '@kstackz/expo-toolkit/components/text';
import {
  SidebarProvider,
  useSidebar,
} from '@kstackz/expo-toolkit/recipes/sidebar';
import { keys } from '@ledger/core/app/commands';
import { placeTitle } from '@ledger/core/app/places';
import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useGate } from '../../ledger';
import { AccountSheet } from '../sheets/accounts';
import { AddSheet } from '../sheets/add';
import { GestureLayer } from './gestures';
import { Globals } from './globals';
import { KeyBar } from './key-bar';
import { LedgerSidebar } from './sidebar';

/**
 * Ledger's frame on a phone: the header with the Place's title and the
 * Place, both in the gesture layer with the Add button at the thumb and
 * the Key Bar above it, the Sidebar as a drawer over them, and the Add and
 * Accounts sheets.
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
        <AddButton />
        <KeyBar />
      </View>
      <LedgerSidebar />
      <AddSheet />
      <AccountSheet />
    </SidebarProvider>
  );
}

// The one button, at the thumb: Add.
function AddButton() {
  const run = keys.useRun();
  const { online } = useGate();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add an entry"
      disabled={!online}
      onPress={() => run('addEntry')}
      style={{ bottom: insets.bottom + 20 }}
      className="absolute right-5 size-14 items-center justify-center rounded-full bg-primary shadow-lg active:scale-95 disabled:opacity-40"
    >
      <AddGlyph />
    </Pressable>
  );
}

function AddGlyph() {
  const color = useCSSVariable('--color-primary-foreground');
  return (
    <Glyph
      icon={PlusSignIcon}
      size={24}
      {...(typeof color === 'string' ? { color } : {})}
    />
  );
}

// The Sidebar's button, the Place's title, and Offline, quietly.
function Header() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { online } = useGate();
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
