import { View } from '@kestack/kabuki/react';
import { StoryShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const Story = StoryShape.build({ init, on: updates, workers });

export const StoryView = View.make(Story, (self) => <Body {...self} />);
