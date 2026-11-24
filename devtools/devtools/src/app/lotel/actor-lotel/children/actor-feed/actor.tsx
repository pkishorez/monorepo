import { View } from '@kestack/kabuki/react';
import { FeedShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const Feed = FeedShape.build({ init, on: updates, workers });

export const FeedView = View.make(Feed, (self) => <Body {...self} />);
