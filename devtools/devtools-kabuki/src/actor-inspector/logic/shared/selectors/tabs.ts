import type { DataOf } from '@kestack/kabuki/types';
import type { InspectorShape, Tab } from '../index.ts';

export const tabsOf = ({
  model,
}: DataOf<typeof InspectorShape>): ReadonlyArray<Tab> =>
  model.fakes.length > 0
    ? ['Running', 'Blueprint', 'World']
    : ['Running', 'Blueprint'];
