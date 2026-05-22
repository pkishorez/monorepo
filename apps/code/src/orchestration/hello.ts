import { Effect, Stream, Schedule } from 'effect';
import { HelloMessage } from '../domain/hello/index.js';

export const getHello = Effect.succeed(
  new HelloMessage({
    message: 'Hello, World!',
    timestamp: Date.now(),
  }),
);

const greetings = ['Hello...', 'from...', 'Effect RPC!', 'Streaming works!'];

export const streamHello = Stream.fromIterable(greetings).pipe(
  Stream.schedule(Schedule.spaced('1 second')),
  Stream.map(
    (message) =>
      new HelloMessage({
        message,
        timestamp: Date.now(),
      }),
  ),
);
