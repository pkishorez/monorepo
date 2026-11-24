import { Actor } from '@kestack/kabuki';
import { View, useChild } from '@kestack/kabuki/react';
import { Feed, FeedView, listedCount } from './children/actor-feed/index.js';
import { Trace, TraceView } from './children/actor-trace/index.js';
import {
  LotelShape,
  init,
  isOpen,
  openedOf,
  updates,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Lotel = LotelShape.build({
  init,
  on: updates,
  workers,
  children: {
    // 1. Feed
    feed: Actor.child(Feed, {
      props: ({ model }) => ({ opened: model.opened }),
      emits: { Opened: ({ traceId }) => ({ _tag: 'Opened', traceId }) },
    }),
    // 2. Open
    trace: Actor.child(Trace, {
      while: isOpen,
      key: openedOf,
      input: (data) => ({ traceId: openedOf(data) }),
      props: ({ model }) => ({ layout: model.layout }),
      emits: {
        LaidOut: ({ layout }) => ({ _tag: 'LaidOut', layout }),
        Closed: () => ({ _tag: 'Closed' }),
      },
    }),
  },
});

export const LotelView = View.make(Lotel, (self) => (
  <Body
    {...self}
    count={useChild(self.children.feed, listedCount)}
    feed={<FeedView instance={self.children.feed} />}
    trace={
      self.children.trace ? (
        <TraceView
          key={self.children.trace.address}
          instance={self.children.trace}
        />
      ) : null
    }
  />
));
