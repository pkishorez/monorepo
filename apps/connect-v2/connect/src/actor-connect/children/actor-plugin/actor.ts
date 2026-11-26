import { init, PluginShape, updates, workers } from './logic/index.js';

export const Plugin = PluginShape.build({ init, on: updates, workers });
