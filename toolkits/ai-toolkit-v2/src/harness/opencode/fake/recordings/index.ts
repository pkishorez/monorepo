import type { Event, Methods } from '../../contract/index.js';
import cancel from './cancel.json' with { type: 'json' };
import create from './create.json' with { type: 'json' };
import fork from './fork.json' with { type: 'json' };
import recorded from './methods.json' with { type: 'json' };
import permission from './permission.json' with { type: 'json' };
import send from './send.json' with { type: 'json' };
import session from './session.json' with { type: 'json' };

const recording = (events: unknown) => events as Recording;

export const recordings: Readonly<Record<string, Recording>> = {
  create: recording(create),
  send: recording(send),
  fork: recording(fork),
  permission: recording(permission),
  cancel: recording(cancel),
};

export const methods: Readonly<Partial<Record<keyof Methods, unknown>>> =
  recorded;

export { session };

export type Recording = ReadonlyArray<Event>;
