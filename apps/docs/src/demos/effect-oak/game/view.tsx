import type { ComponentProps } from 'react';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { aheadAt, distanceAfter, Game, laneAt } from './game.js';
import type { Config, Road } from './game.js';
import {
  CrashBanner,
  lapTime,
  PausedOverlay,
  Scene,
  StartOverlay,
  steering,
  useKeys,
} from './scene/index.js';

/*
 * How the game looks. Each State says where things are at a Frame, in road
 * units, and what lies over the road; the Scene, in ./scene, decides how that
 * is drawn, and stays put from one State to the next.
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

export const GameView = View.make(
  Game,
  ({ _tag, model: { config }, state, send, frame }) => {
    const pause = () => send({ _tag: 'PressedPause' });
    const steer = steering(send);
    useKeys(
      _tag === 'Playing'
        ? { ...steer.keys, p: pause }
        : _tag === 'Paused'
          ? { p: pause }
          : {},
    );
    return (
      <Stage
        onPointerDown={_tag === 'Playing' ? steer.onPointerDown : undefined}
      >
        <Scene
          road={config}
          frame={frame}
          where={(at) =>
            _tag === 'Playing'
              ? whereAt(config, state, at)
              : _tag === 'Paused'
                ? whereAt(config, state, state.pausedAt)
                : _tag === 'Crashed'
                  ? whereAt(config, state, state.crashedAt)
                  : PARKED
          }
        >
          {_tag === 'Welcome' ? (
            <StartOverlay onStart={() => send({ _tag: 'Started' })} />
          ) : _tag === 'Playing' ? (
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-2 left-3"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={pause}
            >
              Pause
            </Button>
          ) : _tag === 'Paused' ? (
            <PausedOverlay onResume={pause} />
          ) : (
            <CrashBanner time={lapTime(state.crashedAt - state.startedAt)} />
          )}
        </Scene>
      </Stage>
    );
  },
);
