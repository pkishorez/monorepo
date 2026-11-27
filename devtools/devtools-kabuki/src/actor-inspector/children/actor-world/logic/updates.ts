import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { control } from './commands.ts';
import type { WorldShape } from './shared/index.ts';

export const init: InitOf<typeof WorldShape> = () => ({
  model: { fakes: null, refusal: null },
});

export const updates: UpdatesOf<typeof WorldShape> = {
  Heard: ({ fakes }) => ({ model: { fakes } }),
  Ran: ({ fake, control: name, payload }) => ({
    model: { refusal: null },
    command: control({ fake, control: name, payload }),
  }),
  Refused: ({ fake, control: name, reason }) => ({
    model: { refusal: { fake, control: name, reason } },
  }),
  Dismissed: () => ({ model: { refusal: null } }),
};
