import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { colorful } from './colorful.js';
import { CompactContext, SkyContext } from './context.js';
import { exotic } from './exotic.js';
import type {
  BayProps,
  BerthProps,
  BerthsProps,
  PodProps,
  ButtonProps,
  GaugeProps,
  Kit,
  ShipProps,
  Sky,
  StageProps,
  ToolbarProps,
} from './kit.js';
import { plain } from './plain.js';

export const LOOKS = { plain, colorful, exotic } as const;
export type LookName = keyof typeof LOOKS;

const KitContext = createContext<Kit>(plain);

/** Draws everything inside it in one Look. */
export const Look = ({
  name,
  children,
}: {
  readonly name: LookName;
  readonly children: ReactNode;
}) => <KitContext value={LOOKS[name]}>{children}</KitContext>;

/*
 * The parts the Views draw with. Each one draws its Look's version, so the
 * same View reads the same in every Look.
 */

export const Stage = ({
  sky = 'clear',
  ...props
}: StageProps & { readonly sky?: Sky }) => {
  const kit = use(KitContext);
  return (
    <MotionConfig transition={kit.transition} reducedMotion="user">
      <SkyContext value={sky}>
        <kit.Stage {...props} />
      </SkyContext>
    </MotionConfig>
  );
};

export const Toolbar = (props: ToolbarProps) => {
  const { Toolbar } = use(KitContext);
  return <Toolbar {...props} />;
};

export const Berths = (props: BerthsProps) => {
  const { Berths } = use(KitContext);
  return (
    <CompactContext value>
      <Berths {...props} />
    </CompactContext>
  );
};

export const Berth = (props: BerthProps) => {
  const { Berth } = use(KitContext);
  return <Berth {...props} />;
};

export const Bay = (props: BayProps) => {
  const { Bay } = use(KitContext);
  return <Bay {...props} />;
};

export const Ship = (props: ShipProps) => {
  const { Ship } = use(KitContext);
  return <Ship {...props} />;
};

export const Pod = (props: PodProps) => {
  const { Pod } = use(KitContext);
  return <Pod {...props} />;
};

export const Gauge = (props: GaugeProps) => {
  const { Gauge } = use(KitContext);
  return <Gauge {...props} />;
};

export const Button = (props: ButtonProps) => {
  const { Button } = use(KitContext);
  return <Button {...props} />;
};
