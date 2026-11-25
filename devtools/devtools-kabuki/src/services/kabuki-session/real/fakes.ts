import { Effect, Stream } from 'effect';
import type { FakeWorld } from '@kestack/kabuki/fake';
import type { FakeNow as Told } from '@kestack/kabuki/fake/types';
import { ControlRefused } from '../../../server/rpc/session/contract/index.ts';
import type {
  ControlAsked,
  FakeNow,
} from '../../../server/rpc/session/contract/index.ts';
import { encoded } from './encode.ts';
import { shapeOf } from './shape.ts';

const fakeOf = ({ name, state, value, controls }: Told): FakeNow => ({
  name,
  state: shapeOf(state),
  value: encoded(state, value),
  controls: controls.map((control) => ({
    name: control.name,
    payload: shapeOf(control.payload),
  })),
});

export const fakesOf = (
  world: FakeWorld | undefined,
): Stream.Stream<ReadonlyArray<FakeNow>> =>
  world
    ? world.fakes.pipe(Stream.map((fakes) => fakes.map(fakeOf)))
    : Stream.succeed([]);

export const controlOf = (
  world: FakeWorld | undefined,
  { fake, control, payload }: ControlAsked,
) =>
  world
    ? world
        .control(fake, control, payload)
        .pipe(
          Effect.mapError(
            (reason) => new ControlRefused({ fake, control, reason }),
          ),
        )
    : Effect.fail(
        new ControlRefused({
          fake,
          control,
          reason: 'This app runs no FakeWorld',
        }),
      );
