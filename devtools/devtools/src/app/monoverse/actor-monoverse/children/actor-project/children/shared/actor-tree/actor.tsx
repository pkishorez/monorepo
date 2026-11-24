import { View } from '@kestack/kabuki/react';

import { TreeShape, init, updates } from './logic/index.js';
import { Body } from './view/index.js';

export const Tree = TreeShape.build({ init, on: updates });

export const TreeView = View.make(Tree, (self) => <Body {...self} />);
