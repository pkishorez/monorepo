import { board } from './board/index.ts';
import { chat } from './chat/index.ts';
import type { Feature } from './feature.ts';
import { mail } from './mail/index.ts';
import { news } from './news/index.ts';
import { photos } from './photos/index.ts';

/** Every Feature, in the order the list shows them. */
export const FEATURES: ReadonlyArray<Feature> = [
  mail,
  photos,
  chat,
  board,
  news,
];
