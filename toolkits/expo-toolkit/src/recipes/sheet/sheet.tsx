import type { ReactNode } from 'react';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../../components/bottom-sheet';

/**
 * A sheet from the bottom for a short form: open while `open` is, dragged
 * down by its grip, a tap behind it or Android's back to close, and kept
 * above the keyboard while one of its fields is typed in. The title is
 * shown, or only read out when `titleHidden`. Closing calls `onClose` once,
 * whichever way it went.
 *
 * ```tsx
 * <Sheet open={open} onClose={close} title="New account">
 *   <Input … />
 * </Sheet>
 * ```
 */
export function Sheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleHidden?: boolean;
  children: ReactNode;
}) {
  return (
    <BottomSheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <BottomSheet.Content
        accessibilityLabel={props.title}
        showClose={!props.titleHidden}
      >
        {!props.titleHidden && <BottomSheet.Header title={props.title} />}
        <BottomSheet.Body keyboardShouldPersistTaps="handled">
          {props.children}
        </BottomSheet.Body>
        <KeyboardRoom />
      </BottomSheet.Content>
    </BottomSheet>
  );
}

// As tall as the keyboard covers past the sheet's own bottom padding, so
// the sheet grows up out of its way.
function KeyboardRoom() {
  const keyboard = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();
  const style = useAnimatedStyle(() => ({
    height: Math.max(0, keyboard.height.value - Math.max(insets.bottom, 16)),
  }));
  return <Animated.View style={style} />;
}
