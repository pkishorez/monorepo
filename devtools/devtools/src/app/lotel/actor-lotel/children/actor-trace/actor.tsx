import { View } from '@kestack/kabuki/react';
import { TraceShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const Trace = TraceShape.build({ init, on: updates, workers });

export const TraceView = View.make(Trace, (self) => <Body {...self} />);
