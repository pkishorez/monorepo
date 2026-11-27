import { View } from '@kestack/kabuki/react';
import { WorldShape, init, updates, workers } from './logic/index.ts';
import { Body } from './view/index.ts';

export const World = WorldShape.build({ init, on: updates, workers });

export const WorldView = View.make(World, (self) => <Body {...self} />);
