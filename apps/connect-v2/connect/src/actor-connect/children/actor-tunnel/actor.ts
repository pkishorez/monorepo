import { init, TunnelShape, updates, workers } from './logic/index.js';

export const Tunnel = TunnelShape.build({ init, on: updates, workers });
