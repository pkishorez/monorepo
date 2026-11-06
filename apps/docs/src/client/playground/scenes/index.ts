import type { ComponentType } from 'react';
import {
  GaugeIcon,
  ListTodoIcon,
  SunIcon,
  type LucideIcon,
} from 'lucide-react';
import { BenchScene } from './bench.tsx';
import { LightingScene } from './lighting.tsx';
import { TodosScene } from './todos/index.ts';

export type Scene = {
  /** The URL hash that opens it. */
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly icon: LucideIcon;
  readonly Scene: ComponentType;
};

export const SCENES: ReadonlyArray<Scene> = [
  {
    id: 'todos',
    title: 'To-dos',
    tagline: 'Lighting and time travel',
    icon: ListTodoIcon,
    Scene: TodosScene,
  },
  {
    id: 'lighting',
    title: 'Lighting',
    tagline: 'Pointer light, shadows, lamps',
    icon: SunIcon,
    Scene: LightingScene,
  },
  {
    id: 'performance',
    title: 'Performance',
    tagline: 'What it all costs',
    icon: GaugeIcon,
    Scene: BenchScene,
  },
];
