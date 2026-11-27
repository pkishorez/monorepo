/*
 * The Microphone fake: the microphones of the computer the browser runs
 * on, for Code's fake mode (`src/fake.ts`). Its state starts with the
 * Built-in Microphone, the site allowed at once; its control plugs one
 * more microphone in. Its Layer gives `Recorder`, the real one over it,
 * its audio made-up PCM the Speech fake hears as any other.
 */

export { microphone, type MicrophoneState } from './microphone.ts';
