import { haptic } from '@kstackz/expo-toolkit/feedback';
import { useCallback } from 'react';
import { useSettings } from './app';

/**
 * A moment of one of Ledger's gestures. The Thumb Lock locks, Steps, opens
 * a list, goes back, meets a Wrong Way and goes; a row swiped to delete
 * arms past the line and deletes; a swipe opens the Sidebar; a swipe turns
 * a page of Settings.
 */
export type Moment =
  | 'lock'
  | 'step'
  | 'open'
  | 'back'
  | 'wrong'
  | 'go'
  | 'arm'
  | 'delete'
  | 'sidebar'
  | 'page';

// Each moment's haptic, all of them light: a click for each Step and page,
// a soft tap as something locks, opens or lands, a crisp one for a Wrong
// Way or a row armed.
const HAPTICS = {
  lock: 'soft',
  step: 'selection',
  open: 'soft',
  back: 'soft',
  wrong: 'rigid',
  go: 'light',
  arm: 'rigid',
  delete: 'light',
  sidebar: 'soft',
  page: 'selection',
} as const satisfies Record<Moment, Parameters<typeof haptic>[0]>;

/**
 * What a gesture feels like: each moment plays its haptic while the
 * Haptics setting is on. Phones make no sounds; Commands are silent here.
 */
export const useFeel = () => {
  const [{ haptics }] = useSettings();
  return useCallback(
    (moment: Moment) => {
      if (haptics) haptic(HAPTICS[moment]);
    },
    [haptics],
  );
};
