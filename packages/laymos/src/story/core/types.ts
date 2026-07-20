import type { LogLine } from '../artifact/index.js';

export type AttrValue = string | number | boolean;

export type Attrs = Readonly<Record<string, AttrValue>>;

export interface BlockMeta {
  readonly description?: string;
  readonly attrs?: Attrs;
}

export interface StoryFnMeta<Args extends readonly unknown[]> {
  readonly description?: string;
  readonly attrs?: Attrs | ((...args: Args) => Attrs);
}

export type StoryMode =
  | 'noop'
  | 'trace'
  | 'log'
  | { readonly emit: (line: LogLine) => void };
