import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';
import {
  type TunnelShape,
  UNREACHABLE_BEFORE_RESTART,
  urlOf,
} from './shared/index.js';

type Data = DataOf<typeof TunnelShape>;

export const init: InitOf<typeof TunnelShape> = (input) => ({
  model: {
    settings: input,
    listening: null,
    key: '',
    opening: 0,
    unreachable: 0,
  },
  state: { _tag: 'SettingUp' },
});

const restarted = ({ model }: Data) => ({
  model: { opening: model.opening + 1, unreachable: 0 },
  state: { _tag: 'SettingUp' } as const,
  emit: { _tag: 'TunnelAddressChanged', url: null, key: model.key } as const,
});

export const updates: UpdatesOf<typeof TunnelShape> = {
  PortOpened: ({ port, key }) => ({
    model: { listening: port, key },
    emit: { _tag: 'TunnelAddressChanged', url: null, key },
  }),
  PortFailed: ({ reason }) => ({ emit: { _tag: 'TunnelFailed', reason } }),
  TunnelUp: ({ url }, { model }) => ({
    model: { unreachable: 0 },
    state: { _tag: 'Active', url, reachable: null },
    emit: { _tag: 'TunnelAddressChanged', url, key: model.key },
  }),
  TunnelDown: (_, data) => restarted(data),
  TunnelReachable: (_, { state }) =>
    state._tag === 'Active'
      ? { model: { unreachable: 0 }, state: { ...state, reachable: true } }
      : {},
  TunnelUnreachable: (_, data) => {
    if (data.state._tag !== 'Active') return {};
    const unreachable = data.model.unreachable + 1;
    return unreachable >= UNREACHABLE_BEFORE_RESTART
      ? restarted(data)
      : {
          model: { unreachable },
          state: { ...data.state, reachable: false },
        };
  },
  KeyRotated: ({ key }, data) => ({
    model: { key },
    emit: { _tag: 'TunnelAddressChanged', url: urlOf(data), key },
  }),
};
