import { View } from '@kestack/kabuki/react';
import { WorldShape, init, updates } from './logic/index.ts';
import { Body } from './view/index.ts';

export const World = WorldShape.build({ init, on: updates });

export const WorldView = View.make(World, (self) => <Body {...self} />);
