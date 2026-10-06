import { Switch } from '@kstackz/expo-toolkit/components/switch';
import { Text } from '@kstackz/expo-toolkit/components/text';
import {
  type Gesture,
  GESTURE_GUIDE,
  type GestureGroup,
  said,
} from '@ledger/core/client/commands';
import { View } from 'react-native';
import { useChangeSettings, useSettings } from '../../../ledger';
import { GestureFigure } from './figure';
import { Group, Row } from './rows';

/**
 * Settings' Gestures Section: the Thumb Lock's switch, how it works, and
 * every gesture, Place by Place as they nest, each drawn as it moves. They
 * can't be changed, only learned.
 */
export function Gestures() {
  const settings = useSettings();
  const change = useChangeSettings();
  return (
    <View className="gap-10">
      <Group title="Thumb Lock">
        <Row
          label="Thumb Lock"
          hint="Two-finger commands on a touch screen. Taps, the sidebar swipe and swiping a row to delete always work."
        >
          <Switch
            value={settings.gesturesOn}
            onValueChange={(gesturesOn) => change({ gesturesOn })}
            label="Thumb Lock"
          />
        </Row>
      </Group>

      <View className="flex-row items-start gap-4 rounded-xl border border-border p-4">
        <GestureFigure motion={{ kind: 'thumb', way: 'up' }} large />
        <View className="flex-1 gap-1.5">
          <Text weight="medium" accessibilityRole="header" className="text-sm">
            The Thumb Lock
          </Text>
          <Text muted className="text-sm">
            Rest your left thumb still on the screen, then swipe up or down with
            another finger to Step through the Places listed at the top. Swipe
            right to open a Place's sections or your accounts, and left to come
            back. Let go of the finger to go to the one marked; lift your thumb
            first to go nowhere. Sideways where there is nothing to open, the
            list shakes.
          </Text>
        </View>
      </View>

      <View className="gap-8">{GESTURE_GUIDE.map(groupOf)}</View>
    </View>
  );
}

function groupOf(group: GestureGroup) {
  return (
    <View key={group.title} className="gap-1">
      <Text weight="medium" muted className="text-xs">
        {group.title}
      </Text>
      <View className="divide-y divide-border">
        {group.gestures.map(rowOf)}
      </View>
      {group.inside && (
        <View className="mt-3 gap-6 border-l border-border pl-4">
          {group.inside.map(groupOf)}
        </View>
      )}
    </View>
  );
}

function rowOf(gesture: Gesture, i: number) {
  return (
    <View key={i} className="flex-row items-center gap-3 py-2">
      <GestureFigure motion={gesture.motion} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm">
          {gesture.does}
        </Text>
        <Text muted numberOfLines={1} className="text-xs">
          {said(gesture.motion, { fromEdge: true })}
        </Text>
      </View>
    </View>
  );
}
