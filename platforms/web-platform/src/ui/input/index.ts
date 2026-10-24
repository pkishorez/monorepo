// How a person drives the app: what the device can be driven by, touch
// gestures with every finger as Motion values in nested Gesture Zones, the
// keys and what they do, and the sounds and buzzes that answer a touch.
export { DEVICE_SCRIPT, type Device, useDevice } from './device/index.ts';
export * from './gesture/index.ts';
export * from './keys/index.ts';
export * from './sound/index.ts';
