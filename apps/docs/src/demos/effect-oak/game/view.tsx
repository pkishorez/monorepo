import type { ComponentProps } from 'react';
import { View } from 'effect-oak/react';
import { aheadAt, distanceAfter, Game, laneAt } from './game.js';
import type { Config, Road } from './game.js';
import {
  CrashBanner,
  lapTime,
  Scene,
  StartOverlay,
  useSteering,
} from './scene/index.js';

/*
 * How the game looks, per State. Each State says where things are at a
 * Frame, in road units; the Scene, in ./scene, decides how that is drawn.
 */

/** Where everything is at Time `at`, worked out from the Model alone. */
const whereAt = (config: Config, road: Road, at: number) => ({
  driving: at - road.startedAt,
  driven: distanceAfter(config, at - road.startedAt),
  lane: laneAt(road.lane, config, at),
  cars: road.cars.map((car) => ({
    lane: car.lane,
    ahead: aheadAt(config, road, car, at),
  })),
});

const PARKED = { driving: 0, driven: 0, lane: 0, cars: [] };

/** The whole stage, so a tap on either half of it steers. */
const Stage = (props: ComponentProps<'div'>) => (
  <div
    className="flex size-full touch-manipulation items-center justify-center select-none"
    {...props}
  />
);

export const GameView = View.make(Game, {
  Welcome: ({ model: { config }, send, useFrame }) => (
    <Stage>
      <Scene road={config} useFrame={useFrame} where={() => PARKED}>
        <StartOverlay onStart={() => send({ _tag: 'Started' })} />
      </Scene>
    </Stage>
  ),

  Playing: ({ model: { config }, state, send, useFrame }) => (
    <Stage {...useSteering(send)}>
      <Scene
        road={config}
        useFrame={useFrame}
        where={(at) => whereAt(config, state, at)}
      />
    </Stage>
  ),

  Crashed: ({ model: { config }, state, useFrame }) => (
    <Stage>
      <Scene
        road={config}
        useFrame={useFrame}
        where={() => whereAt(config, state, state.crashedAt)}
      >
        <CrashBanner time={lapTime(state.crashedAt - state.startedAt)} />
      </Scene>
    </Stage>
  ),
});
