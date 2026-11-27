import { View } from '@kestack/kabuki/react';
import { BlueprintShape, init, updates, workers } from './logic/index.ts';
import { Body } from './view/index.ts';

export const Blueprint = BlueprintShape.build({ init, on: updates, workers });

export const BlueprintView = View.make(Blueprint, (self) => <Body {...self} />);
