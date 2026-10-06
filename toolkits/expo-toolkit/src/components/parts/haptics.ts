/**
 * Optional bridge to the platform's haptic engine.
 *
 * A tick under the finger is the difference between a control that responds
 * and one that merely updates — but it is also the kind of thing that has to
 * be free to ignore. `expo-haptics` is resolved lazily and every caller falls
 * back to doing nothing, so a component with `haptics` set is silent rather
 * than broken when the package is absent.
 *
 * ```sh
 * npx expo install expo-haptics
 * ```
 */
import { Platform } from 'react-native';

interface HapticsModule {
  selectionAsync: () => Promise<void>;
  impactAsync: (style?: unknown) => Promise<void>;
  ImpactFeedbackStyle?: Record<string, unknown>;
}

let resolved = false;
let module: HapticsModule | null = null;

/**
 * The haptics module, or null when it is not installed or the platform has no
 * engine behind it. Resolved once and cached — a failed require is not retried
 * on every keystroke.
 */
function getHaptics(): HapticsModule | null {
  if (resolved) return module;
  resolved = true;

  // Web has no haptic engine; the Vibration API is a different thing and a
  // worse one — a buzz where a tick was meant.
  if (Platform.OS === 'web') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-haptics') as HapticsModule;
  } catch {
    module = null;
  }

  return module;
}

/** Whether a haptic will actually be felt. */
export function hasHaptics(): boolean {
  return getHaptics() !== null;
}

/**
 * The light tick for moving between options — a segmented control, a picker,
 * a section marker. Deliberately not an impact: selection is the lightest of
 * the feedbacks, and anything heavier gets tiring when it fires on scroll.
 *
 * Fire-and-forget. A rejected haptic is not worth an unhandled rejection, and
 * there is nothing useful to do about one.
 */
export function selectionTick(): void {
  void getHaptics()?.selectionAsync().catch(() => {});
}

/**
 * The knock for a thing coming loose or landing — a row lifted out of a list,
 * a card dropped into place.
 *
 * An impact rather than a selection because it marks a change of state rather
 * than a change of value: the finger is now holding something it was not
 * holding a moment ago, and the lightest feedback is not enough to say so.
 * `medium` is the one that reads as picking something up without reading as an
 * error.
 *
 * Falls back to a selection tick where the style constants are missing, and to
 * nothing at all where the package is.
 */
export function impactKnock(): void {
  const haptics = getHaptics();
  if (!haptics) return;
  void haptics
    .impactAsync(haptics.ImpactFeedbackStyle?.Medium)
    .catch(() => {});
}
