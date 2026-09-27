import {
  Grid3x3Icon,
  InboxIcon,
  PanelLeftIcon,
} from '@kstackz/ui-toolkit/lucide';
import type { ComponentType } from 'react';
import { InboxScreen, inboxTutorial } from '../inbox/index.ts';
import { MatrixScreen, matrixTutorial } from '../matrix/index.ts';
import { SidebarScreen, sidebarTutorial } from '../sidebar-demo/index.ts';
import type { Tutorial } from '../tutorial/index.ts';

export const DEMO_IDS = ['matrix', 'inbox', 'sidebar'] as const;
export type DemoId = (typeof DEMO_IDS)[number];

export type Demo = {
  readonly title: string;
  readonly Icon: ComponentType<{ readonly className?: string }>;
  readonly Screen: ComponentType;
  readonly tutorial: Tutorial;
};

export const DEMOS: Record<DemoId, Demo> = {
  matrix: {
    title: 'Matrix',
    Icon: Grid3x3Icon,
    Screen: MatrixScreen,
    tutorial: matrixTutorial,
  },
  inbox: {
    title: 'Inbox',
    Icon: InboxIcon,
    Screen: InboxScreen,
    tutorial: inboxTutorial,
  },
  sidebar: {
    title: 'Sidebar',
    Icon: PanelLeftIcon,
    Screen: SidebarScreen,
    tutorial: sidebarTutorial,
  },
};

/** The demo a `?demo=` value names, or the Matrix. */
export const parseDemo = (value: unknown): DemoId =>
  DEMO_IDS.find((id) => id === value) ?? 'matrix';
