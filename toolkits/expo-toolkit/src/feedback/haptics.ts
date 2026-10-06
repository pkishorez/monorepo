import * as Haptics from 'expo-haptics';

export type Haptic =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

/** The expo-haptics call behind each Haptic. */
export function buzz(kind: Haptic): Promise<void> {
  switch (kind) {
    case 'selection':
      return Haptics.selectionAsync();
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'heavy':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    case 'success':
      return Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
    case 'warning':
      return Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      );
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}
