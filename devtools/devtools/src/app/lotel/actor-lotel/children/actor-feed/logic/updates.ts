import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { holding, idsOf, tracesListed } from './shared/index.js';
import type { Filters, FeedShape } from './shared/index.js';

const NO_FILTERS: Filters = {
  attributeFilters: [],
  sinceNow: null,
  status: 'all',
};

/** How many Traces the list shows at first, and how many more each time. */
const PAGE_SIZE = 30;

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, at) => id === right[at]);

// 3. Hold
/** After any change to what is listed: what is shown follows it unless held. */
const settled = (data: DataOf<typeof FeedShape>) => {
  const { model, props } = data;
  const listed = idsOf(tracesListed(data));
  const shown = new Set(model.shown);
  return holding(listed, shown, model.ready, props.opened) ||
    sameIds(listed, model.shown)
    ? model
    : { ...model, shown: listed };
};

export const init: InitOf<typeof FeedShape> = () => ({
  model: {
    spans: [],
    ready: false,
    search: '',
    filters: NO_FILTERS,
    groupBy: null,
    expanded: {},
    count: PAGE_SIZE,
    shown: [],
    restored: false,
  },
});

export const updates: UpdatesOf<typeof FeedShape> = {
  // 1. Watch
  Received: ({ spans, ready }, data) => ({
    model: settled({ ...data, model: { ...data.model, spans, ready } }),
  }),
  // 2. Narrow
  Restored: ({ saved }, data) => ({
    model: settled({
      ...data,
      model: { ...data.model, ...saved, restored: true },
    }),
  }),
  Searched: ({ search }, data) => ({
    model: settled({ ...data, model: { ...data.model, search } }),
  }),
  Filtered: ({ filters }, data) => ({
    model: settled({ ...data, model: { ...data.model, filters } }),
  }),
  Grouped: ({ groupBy }) => ({ model: { groupBy } }),
  Toggled: ({ group }, { model }) => ({
    model: {
      expanded: {
        ...model.expanded,
        [group]: model.expanded[group] === false,
      },
    },
  }),
  ShowedMore: (_, { model }) => ({
    model: { count: model.count + PAGE_SIZE },
  }),
  // 3. Hold
  Revealed: (_, data) => ({
    model: { shown: idsOf(tracesListed(data)) },
  }),
  // 4. Open: what is listed now is what the list holds while it is open.
  Picked: ({ traceId }, data) => ({
    model: { shown: idsOf(tracesListed(data)) },
    emit: { _tag: 'Opened', traceId },
  }),
};
