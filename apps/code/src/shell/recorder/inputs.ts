import { Effect, Queue, Stream } from 'effect';

/*
 * The browser's microphones, its audio inputs, as a person chooses from
 * them: the system default first, then each one by name. Their names are
 * blank until this site may use a microphone, so a list with a blank name
 * asks first: the microphone opens and is let go at once, and the list is
 * read again. Plugging one in or out reads it again.
 */

/** One audio input: the browser's `deviceId` and its name; `null` for the system default. */
export interface Input {
  readonly deviceId: string | null;
  readonly label: string;
}

/** Ids the browser gives to entries that stand for another input. */
const STANDS_IN = new Set(['default', 'communications']);

/**
 * The inputs as listed: the system default first, named after the input
 * it is now when the browser says so, then every real input once.
 */
export const listed = (
  devices: ReadonlyArray<MediaDeviceInfo>,
): ReadonlyArray<Input> => {
  const audio = devices.filter(({ kind }) => kind === 'audioinput');
  const system = audio.find(({ deviceId }) => deviceId === 'default');
  return [
    { deviceId: null, label: system?.label ?? '' },
    ...audio
      .filter(({ deviceId }) => deviceId !== '' && !STANDS_IN.has(deviceId))
      .map(({ deviceId, label }) => ({ deviceId, label })),
  ];
};

const named = (devices: ReadonlyArray<MediaDeviceInfo>) =>
  devices.every(({ kind, label }) => kind !== 'audioinput' || label !== '');

/** Asks to use a microphone, so the names show, and lets it go at once. */
const ask = (media: MediaDevices) =>
  Effect.tryPromise({
    try: () => media.getUserMedia({ audio: true }),
    catch: (cause) => cause,
  }).pipe(
    Effect.map((stream) => {
      for (const track of stream.getTracks()) track.stop();
    }),
  );

/**
 * The inputs now, and again each time one comes or goes; it fails with
 * the browser's own error when the site may not use a microphone.
 */
export const inputsOf = (media: MediaDevices) =>
  Effect.gen(function* () {
    const read = Effect.promise(() => media.enumerateDevices());
    const first = yield* read;
    const devices = named(first)
      ? first
      : yield* Effect.andThen(ask(media), read);
    const changed = Stream.callback<void>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const heard = () => Queue.offerUnsafe(queue, undefined);
            media.addEventListener('devicechange', heard);
            return heard;
          }),
          (heard) =>
            Effect.sync(() => media.removeEventListener('devicechange', heard)),
        ),
      { bufferSize: 1, strategy: 'sliding' },
    );
    return Stream.concat(
      Stream.make(devices),
      Stream.mapEffect(changed, () => read),
    ).pipe(Stream.map(listed));
  }).pipe(Stream.unwrap);
