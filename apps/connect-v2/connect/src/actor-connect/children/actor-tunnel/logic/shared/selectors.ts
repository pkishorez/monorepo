import type { DataOf } from '@kestack/kabuki/types';
import type { Route } from '../../../../../services/server/contract/index.js';
import type { TunnelShape } from './shape.js';

type Data = DataOf<typeof TunnelShape>;

export const UNREACHABLE_BEFORE_RESTART = 3;

export const urlOf = ({ state }: Pick<Data, 'state'>) =>
  state._tag === 'Active' ? state.url : null;

export const routeOf = (
  routes: Data['props']['routes'],
  name: string,
  hash: string,
): Route | null => {
  const route = routes[name];
  if (route === undefined) return null;
  return route.hash === hash
    ? { socket: route.socket }
    : { running: route.hash };
};
