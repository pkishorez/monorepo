import { read } from '../../../services/alchemy-state/index.ts';
export const listResources = (
  connection: Parameters<typeof read>[0],
  stack: string,
  stage: string,
) => read(connection, { kind: 'resources', stack, stage });
