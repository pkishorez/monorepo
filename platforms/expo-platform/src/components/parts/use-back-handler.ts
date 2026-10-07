import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Runs a handler when the Android hardware back button is pressed.
 *
 * An open overlay owns the back button while it is up: pressing back should
 * dismiss the overlay, not pop the screen behind it. Without this, the back
 * gesture navigates away and the overlay is orphaned — the same mistake as a
 * modal that stays put when you tap outside it.
 *
 * The listener is Android-only and gated on `enabled`, so an overlay wires it
 * to `open && dismissible` and nothing runs while the overlay is closed or
 * pinned. Returning `true` from the handler tells the platform the press was
 * consumed, which is what stops the navigation.
 *
 * ```tsx
 * useBackHandler(open && dismissible, () => setOpen(false));
 * ```
 */
export function useBackHandler(enabled: boolean, onBack: () => void): void {
  // Held in a ref so a caller passing an inline `() => setOpen(false)` does not
  // resubscribe the listener on every render — only a change in `enabled` does.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });

    return () => subscription.remove();
  }, [enabled]);
}
