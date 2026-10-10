import { View } from 'effect-oak/react';
import { Input } from '@kstackz/web-platform/components/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kstackz/web-platform/components/native-select';
import {
  DietParam,
  PeriodParam,
  QuerySync,
  SearchParam,
} from './query-sync.js';
import { DIETS, PERIODS, Table } from './table/index.js';

const SearchView = View.make(SearchParam, ({ model, send }) => (
  <Input
    aria-label="Search by name"
    placeholder="Search by name…"
    className="min-w-48 flex-1"
    value={model.value}
    onChange={(event) => send({ _tag: 'Edited', value: event.target.value })}
  />
));

const pickerView = (
  node: typeof DietParam,
  label: string,
  options: ReadonlyArray<string>,
) =>
  View.make(node, ({ model, send }) => (
    <NativeSelect
      aria-label={label}
      value={model.value}
      onChange={(event) => send({ _tag: 'Edited', value: event.target.value })}
    >
      <NativeSelectOption value="">
        All {label.toLowerCase()}
      </NativeSelectOption>
      {options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  ));

const DietView = pickerView(DietParam, 'Diets', DIETS);
const PeriodView = pickerView(PeriodParam, 'Periods', PERIODS);

export const QuerySyncView = View.make(
  QuerySync,
  ({ model, children, frame, send }) => (
    <div className="size-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dinosaur explorer</h1>
          <p className="text-muted-foreground">
            Filter, sort and search. Every control is kept in the URL: change
            them, then copy the address or reload the page.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <SearchView node={children.search} frame={frame} />
          <DietView node={children.diet} frame={frame} />
          <PeriodView node={children.period} frame={frame} />
        </div>
        <Table
          browse={model.browse}
          onSort={(column) => send({ _tag: 'ClickedColumnHeader', column })}
        />
      </div>
    </div>
  ),
);
