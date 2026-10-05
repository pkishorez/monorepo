import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import {
  defaultSettings,
  type Settings,
} from '../../../domain/settings/index.ts';
import { deviceSettings } from './store.ts';

/** This device's Settings, live; the defaults until any is changed. */
export const useSettings = (): Settings => {
  const { collection } = deviceSettings();
  const { data } = useLiveQuery((q) => q.from({ row: collection }));
  return useMemo(() => {
    const stored = data[0];
    if (stored === undefined) return defaultSettings;
    const { id, sound, keys, keysOn, gesturesOn, switching } = stored;
    return { id, sound, keys, keysOn, gesturesOn, switching };
  }, [data]);
};

/** Changes some of this device's Settings. */
export const useChangeSettings = () => deviceSettings().change;
