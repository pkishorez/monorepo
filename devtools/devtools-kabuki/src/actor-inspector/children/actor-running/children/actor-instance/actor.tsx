import { View } from '@kestack/kabuki/react';
import { InstanceShape, init, updates, workers } from './logic/index.ts';
import { Body } from './view/index.ts';

export const Instance = InstanceShape.build({ init, on: updates, workers });

export const InstanceView = View.make(Instance, (self) => <Body {...self} />);
