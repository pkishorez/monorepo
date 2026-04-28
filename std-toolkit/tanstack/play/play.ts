import { createLiveQueryCollection, eq } from '@tanstack/react-db';
import { dummyCollection } from '../src/index';

const liveQuery1 = createLiveQueryCollection((q) =>
  q.from({ items: dummyCollection }).select(({ items }) => items),
);

const liveQuery2 = createLiveQueryCollection((q) =>
  q
    .from({ items: dummyCollection })
    .where(({ items }) => eq(items.category, 'work'))
    .select(({ items }) => items),
);

const liveQuery3 = createLiveQueryCollection((q) =>
  q
    .from({ items: dummyCollection })
    .orderBy(({ items }) => items.priority, 'desc')
    .limit(10)
    .offset(5)
    .select(({ items }) => items),
);

liveQuery1.subscribeChanges(() => {});
liveQuery2.subscribeChanges(() => {});
liveQuery3.subscribeChanges(() => {});

setTimeout(
  () =>
    Promise.all([
      liveQuery1.cleanup(),
      liveQuery2.cleanup(),
      liveQuery3.cleanup(),
      dummyCollection.cleanup(),
    ]),
  2000,
);
