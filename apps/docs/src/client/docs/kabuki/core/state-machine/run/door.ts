import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { DoorLive } from '../components/door.ts';

// Send the door every Message, and see which ones its State takes.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(DoorLive);
  const door = app.instance({ from: 'docs' });
  yield* Console.log('starts', door.state);

  // Locked has no rule for Opened, so the Message is ignored.
  yield* Console.log('Opened:', door.send({ _tag: 'Opened' }), door.state);

  yield* Console.log('Unlocked:', door.send({ _tag: 'Unlocked' }), door.state);
  yield* Console.log('Opened:', door.send({ _tag: 'Opened' }), door.state);

  // Open has no rule for Locked either. Shut it first.
  yield* Console.log('Locked:', door.send({ _tag: 'Locked' }), door.state);
  yield* Console.log('Shut:', door.send({ _tag: 'Shut' }), door.state);
  yield* Console.log('Locked:', door.send({ _tag: 'Locked' }), door.state);

  // The Model was kept through every State.
  return door.model;
});
