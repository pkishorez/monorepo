import type { Method, Result } from '../../contract/index.ts';
import type { Message } from '../../shared/index.ts';
import answersJson from './answers.json' with { type: 'json' };
import approval from './approval.json' with { type: 'json' };
import cancel from './cancel.json' with { type: 'json' };
import create from './create.json' with { type: 'json' };
import steer from './steer.json' with { type: 'json' };
import structured from './structured.json' with { type: 'json' };

export type Step = Message | { readonly exit: string };

export interface Recording {
  readonly thread: string;
  readonly turn: string;
  readonly messages: ReadonlyArray<Step>;
}

export type Answers = { readonly [M in Method]?: Result<M> };

export const recordings = {
  create,
  steer,
  approval,
  cancel,
  structured,
} as unknown as Readonly<Record<string, Recording>>;

export const answers = answersJson as unknown as Answers;
