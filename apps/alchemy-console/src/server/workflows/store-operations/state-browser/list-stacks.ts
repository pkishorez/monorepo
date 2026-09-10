import { read } from '../../../services/alchemy-state/index.ts';
export const listStacks = (connection: Parameters<typeof read>[0]) =>
  read(connection, { kind: 'stacks' });
