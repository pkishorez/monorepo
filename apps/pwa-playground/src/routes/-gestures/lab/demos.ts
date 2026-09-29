import { Grid3x3Icon, HandIcon, MoveIcon } from '@kstackz/ui-toolkit/lucide';
import type { ComponentType } from 'react';
import { GestureBench, PanBench, SwipeTapBench } from '../bench/index.ts';

export const DEMO_IDS = ['pan', 'gesture', 'swipe'] as const;
export type DemoId = (typeof DEMO_IDS)[number];

export type Demo = {
  readonly title: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
  readonly Screen: ComponentType;
};

export const DEMOS: Record<DemoId, Demo> = {
  pan: { title: 'usePan', Icon: MoveIcon, Screen: PanBench },
  gesture: { title: 'useGesture', Icon: Grid3x3Icon, Screen: GestureBench },
  swipe: { title: 'Swipe · Tap', Icon: HandIcon, Screen: SwipeTapBench },
};

/** The demo a `?demo=` value names, or the first. */
export const parseDemo = (value: unknown): DemoId =>
  DEMO_IDS.find((id) => id === value) ?? DEMO_IDS[0];
