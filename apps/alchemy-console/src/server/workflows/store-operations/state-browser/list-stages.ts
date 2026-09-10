import { read } from '../../../services/alchemy-state/index.ts';
export const listStages = (
  connection: Parameters<typeof read>[0],
  stack: string,
) => read(connection, { kind: 'stages', stack });
