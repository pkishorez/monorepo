import type { FunctionComponent, ReactNode } from 'react';
import type { Transition } from 'motion/react';

/** Where a rocket is in its story, as the Views tell a Look. */
export type Phase = 'pad' | 'countdown' | 'flight' | 'landed' | 'lost';

/** Whether a rocket's engine burns: in flight and through the countdown. */
export const firing = (phase: Phase) =>
  phase === 'flight' || phase === 'countdown';

export type Sky = 'clear' | 'storm';

export interface StageProps {
  readonly children: ReactNode;
}

export interface ToolbarProps {
  readonly children: ReactNode;
}

export interface BerthsProps {
  readonly children: ReactNode;
}

/** One rocket's place on the site, under its name. */
export interface BerthProps {
  readonly name: string;
  readonly children: ReactNode;
}

/** One rocket: its scene with a sky and a pad, its gauge, its status and its controls. */
export interface BayProps {
  readonly phase: Phase;
  readonly status?: string;
  readonly gauge: ReactNode;
  /** What is in the sky: the rocket while it flies. */
  readonly sky?: ReactNode;
  /** What is on the pad: the rocket before launch and after landing. */
  readonly pad?: ReactNode;
  /** The controls. */
  readonly children: ReactNode;
}

export interface ShipProps {
  readonly phase: Phase;
  /** Set to glide between the pad and the sky when the rocket moves. */
  readonly layoutId?: string;
  /** Drawn on either side of the rocket: the first left, the second right. */
  readonly boosters?: ReadonlyArray<ReactNode>;
}

export interface PodProps {
  readonly firing: boolean;
}

export interface GaugeProps {
  readonly fuel: number;
}

export interface ButtonProps {
  readonly onClick: () => void;
  readonly children: ReactNode;
  /** `go` for the one action that moves the story on, `stop` for one that ends it. */
  readonly tone?: 'go' | 'stop';
  /** For a switch, like the storm. */
  readonly pressed?: boolean;
}

/** A Look: how every part of a rocket app is drawn. The Views say what, the Look says how. */
export interface Kit {
  /** How things move in this Look, for every Motion animation inside it. */
  readonly transition: Transition;
  readonly Stage: FunctionComponent<StageProps>;
  readonly Toolbar: FunctionComponent<ToolbarProps>;
  readonly Berths: FunctionComponent<BerthsProps>;
  readonly Berth: FunctionComponent<BerthProps>;
  readonly Bay: FunctionComponent<BayProps>;
  readonly Ship: FunctionComponent<ShipProps>;
  readonly Pod: FunctionComponent<PodProps>;
  readonly Gauge: FunctionComponent<GaugeProps>;
  readonly Button: FunctionComponent<ButtonProps>;
}
