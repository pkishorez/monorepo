import { View } from '@kestack/kabuki/react';
import { ChatShape, init, updates, workers } from './logic/index.js';
import { Body } from './view/index.js';

export const Chat = ChatShape.build({ init, on: updates, workers });

export const ChatView = View.make(Chat, (self) => <Body {...self} />);
