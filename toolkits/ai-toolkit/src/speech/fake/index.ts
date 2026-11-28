/*
 * `@kestack/ai-toolkit/speech/fake`: the Speech fake, Speech to Text as a
 * computer has it, for a FakeWorld. Its state starts switched off with
 * nothing on disk; the model downloads by itself once the app asks for
 * it, and its one control says what every Take turns into. Its Layer
 * gives `Speech`: the real speech model and Takes over the fake.
 * Browser-safe: nothing here imports Node.
 *
 * `makeFakeSpeech` is the older fake for tests: a `SpeechToText` under
 * the Node `speechLayer`.
 */

export { speech } from './speech.js';
export { makeFakeSpeech } from './fake-speech.js';

export type { SpeechState } from './speech.js';
export type { FakeSpeech } from './fake-speech.js';
