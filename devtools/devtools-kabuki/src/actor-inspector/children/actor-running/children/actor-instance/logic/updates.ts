import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { send } from './commands.ts';
import type { InstanceShape } from './shared/index.ts';

export const init: InitOf<typeof InstanceShape> = ({ address }) => ({
  model: {
    address,
    opened: null,
    problem: null,
    sending: null,
    outcome: null,
  },
});

export const updates: UpdatesOf<typeof InstanceShape> = {
  Read: ({ opened }) => ({ model: { opened, problem: null } }),
  Failed: ({ problem }) => ({ model: { problem } }),
  Submitted: ({ tag, message }, { model }) =>
    model.sending === null
      ? {
          model: { sending: tag, outcome: null },
          command: send({ to: model.address, tag, message }),
        }
      : {},
  Answered: ({ tag, said }) => ({
    model: { sending: null, outcome: { tag, said } },
  }),
  Refused: ({ tag, said, reason }) => ({
    model: { sending: null, outcome: { tag, said, reason } },
  }),
  NowAsked: () => ({ emit: { _tag: 'NowAsked' } }),
};
