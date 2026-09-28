import { Grid3x3Icon } from '@kstackz/ui-toolkit/lucide';
import type { ComponentType } from 'react';
import { ZoneDemo } from '../zone-demo/index.ts';

export const DEMO_IDS = ['zone'] as const;
export type DemoId = (typeof DEMO_IDS)[number];

export type Demo = {
  readonly title: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
  readonly Screen: ComponentType;
};

export const DEMOS: Record<DemoId, Demo> = {
  zone: { title: 'Zone', Icon: Grid3x3Icon, Screen: ZoneDemo },
};

/** The demo a `?demo=` value names, or the first. */
export const parseDemo = (value: unknown): DemoId =>
  DEMO_IDS.find((id) => id === value) ?? DEMO_IDS[0];
