import { type ReactNode, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../../theme';
import { along, type Progress, settle, shuts } from './motion';

/** What the Sidebar shows: a header, a body that scrolls, a footer. */
export type Panel = {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
};

/** How far the open page shrinks, how round it gets, how dim (light, dark). */
const LIFT = { scale: 0.08, radius: 32, dim: { light: 0.3, dark: 0.5 } };

/**
 * The page, `children`, pushed aside by the Sidebar under it, as on the
 * web's phone: as `progress` goes from 0 to 1 the page moves `width` points
 * right, shrinks 8 %, rounds and dims, while the Sidebar slides in its last
 * 20 % and fades up. Open, the page is out of reach: a tap on it, or a drag
 * left on it or on the Sidebar, shuts it, the drag under the finger.
 */
export function Push(props: {
  readonly progress: Progress;
  readonly width: number;
  readonly open: boolean;
  readonly still: boolean;
  readonly onShut: () => void;
  readonly panel: Panel | undefined;
  readonly children: ReactNode;
}) {
  const { progress, width, open } = props;
  const dim = LIFT.dim[useTheme().theme];

  const page = useAnimatedStyle(() => ({
    borderRadius: LIFT.radius * progress.value,
    transform: [
      { translateX: progress.value * width },
      { scale: 1 - LIFT.scale * progress.value },
    ],
  }));
  const shade = useAnimatedStyle(() => ({ opacity: dim * progress.value }));
  const sidebar = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (progress.value - 1) * 0.2 * width }],
  }));

  return (
    <View className="flex-1 bg-surface">
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[styles.sidebar, { width }, sidebar]}
      >
        <ShutByDrag {...props}>
          <PanelView panel={props.panel} />
        </ShutByDrag>
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={open}
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
        style={[styles.page, page]}
      >
        {props.children}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.shade, shade]}
        />
      </Animated.View>
      {open && (
        <ShutByDrag {...props} tap>
          <View
            collapsable={false}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close the sidebar"
            onAccessibilityTap={props.onShut}
            style={[styles.cover, { left: width }]}
          />
        </ShutByDrag>
      )}
    </View>
  );
}

// A drag left under the finger shuts it, and with `tap` a tap does too.
function ShutByDrag(props: {
  readonly progress: Progress;
  readonly width: number;
  readonly still: boolean;
  readonly onShut: () => void;
  readonly open: boolean;
  readonly tap?: boolean;
  readonly children: ReactNode;
}) {
  const { progress, width, still, onShut, open, tap } = props;
  const gesture = useMemo(() => {
    const drag = Gesture.Pan()
      .enabled(open)
      .activeOffsetX([-12, 12])
      .failOffsetY([-18, 18])
      .onUpdate((event) => {
        'worklet';
        progress.value = along(width + event.translationX, width);
      })
      .onEnd((event) => {
        'worklet';
        const shut = shuts(progress.value, event.velocityX, width);
        settle(progress, shut ? 0 : 1, event.velocityX / width, still);
        if (shut) scheduleOnRN(onShut);
      });
    if (!tap) return drag;
    const press = Gesture.Tap().onEnd(() => {
      'worklet';
      settle(progress, 0, 0, still);
      scheduleOnRN(onShut);
    });
    return Gesture.Exclusive(drag, press);
  }, [progress, width, still, onShut, open, tap]);
  return <GestureDetector gesture={gesture}>{props.children}</GestureDetector>;
}

// The Sidebar's own column: clear of the status bar and the home indicator.
function PanelView(props: { readonly panel: Panel | undefined }) {
  const insets = useSafeAreaInsets();
  const panel = props.panel;
  if (panel === undefined)
    return <View collapsable={false} className="flex-1" />;
  return (
    <View
      collapsable={false}
      className="flex-1"
      style={{
        paddingTop: insets.top + 16,
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      {panel.header}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {panel.children}
      </ScrollView>
      {panel.footer !== undefined && (
        <View className="flex-row items-center gap-2 border-t border-border px-5 pt-3">
          {panel.footer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  page: { flex: 1, overflow: 'hidden', transformOrigin: 'left center' },
  shade: { backgroundColor: 'black' },
  cover: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  body: { paddingHorizontal: 20 },
});
