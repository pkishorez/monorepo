import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Where Ledger's gestures mount: around every Place, under the header,
 * inside the Sidebar's drawer. Phase 3c puts the Thumb Lock and its Place
 * Picker here (expo-toolkit's `patterns/thumb-picker`, fed the stops of
 * `stopsFrom` in @ledger/core/client/places, running Go through
 * `keys.useRun`), with Gesture Sounds and Gesture Haptics following the
 * Sounds and Haptics settings (`playCommand`, `buzz` from ../../app), and
 * the edge swipe that opens the Sidebar (`useSidebar`). Today it only lays
 * the Place out.
 */
export function GestureLayer(props: { readonly children: ReactNode }) {
  return <View className="flex-1">{props.children}</View>;
}
