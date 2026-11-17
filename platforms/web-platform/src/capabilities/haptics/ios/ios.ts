import * as Effect from 'effect/Effect';
import type { Make } from '../../platform/index.ts';
import type { HapticsService } from '../web/index.ts';

/**
 * Haptics on an iPhone, which has none for the web: the Taptic Engine,
 * through Capacitor's plugin in the app's shell. The plugin is loaded only
 * where this is made, so no browser downloads it.
 */
export const ios: Make<HapticsService> = Effect.tryPromise(
  () => import('@capacitor/haptics'),
).pipe(
  Effect.map(({ Haptics, ImpactStyle, NotificationType }) => {
    const took = (call: () => Promise<void>) =>
      Effect.tryPromise(call).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
    const weights = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    const outcomes = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    } as const;
    return {
      impact: (weight) =>
        took(() => Haptics.impact({ style: weights[weight] })),
      notify: (outcome) =>
        took(() => Haptics.notification({ type: outcomes[outcome] })),
      // The plugin ticks only between a start and an end.
      selection: took(async () => {
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
      }),
    };
  }),
);
