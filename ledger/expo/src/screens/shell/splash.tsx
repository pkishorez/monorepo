import { Text } from '@kstackz/expo-toolkit/components/text';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useApp } from '../../ledger';
import { LedgerMark } from '../parts';

// The system's splash (the mark on Ledger's dark) stays until this one is
// drawn over it.
void preventAutoHideAsync().catch(() => {});

/**
 * The Splash, as on the web's installed app: the Ledger mark and name and,
 * at the foot, powered by kstack, always on dark. It covers the app from
 * launch until Ledger knows who is signed in, then fades away, once.
 */
export function Splash() {
  const app = useApp();
  const [shown, setShown] = useState(true);
  useEffect(() => void hideAsync().catch(() => {}), []);
  useEffect(() => {
    if (app.kind !== 'checking') setShown(false);
  }, [app.kind]);
  if (!shown) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(250)}
      className="absolute inset-0 items-center bg-[#0a0a0a]"
      accessibilityLabel="Ledger is starting"
    >
      <View className="flex-1 items-center justify-center gap-5">
        <LedgerMark size={88} inverted />
        <Text weight="semibold" className="text-4xl text-[#fafafa]">
          Ledger
        </Text>
      </View>
      <View className="mb-12 flex-row items-center gap-2">
        <View className="size-6 items-center justify-center rounded-md bg-[#fafafa]">
          <Text weight="bold" className="text-[10px] text-[#0a0a0a]">
            ke
          </Text>
        </View>
        <Text className="text-[#a1a1a1]">
          Powered by{' '}
          <Text weight="semibold" className="text-[#fafafa]">
            kstack
          </Text>
        </Text>
      </View>
    </Animated.View>
  );
}
