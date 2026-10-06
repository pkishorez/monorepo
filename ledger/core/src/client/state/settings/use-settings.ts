import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { defaultSettings, type Settings } from '../../domain/settings/index.ts';
import type { DeviceSettings } from './store.ts';

/** This device's Settings, live; the defaults until any is changed. */
export const useSettings = ({ collection }: DeviceSettings): Settings => {
  const { data } = useLiveQuery((q) => q.from({ row: collection }));
  return useMemo(() => {
    const stored = data[0];
    if (stored === undefined) return defaultSettings;
    const { id, sound, haptics, keys, keysOn, gesturesOn, backend } = stored;
    return { id, sound, haptics, keys, keysOn, gesturesOn, backend };
  }, [data]);
};
