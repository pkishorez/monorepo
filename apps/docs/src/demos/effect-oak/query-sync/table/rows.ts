import { DINOSAURS } from './dinosaurs.js';

export const DIETS = ['Carnivore', 'Herbivore', 'Omnivore'] as const;
export const PERIODS = ['Triassic', 'Jurassic', 'Cretaceous'] as const;
export const COLUMNS = ['Name', 'Period', 'Diet', 'Length', 'Weight'] as const;

export type Column = (typeof COLUMNS)[number];
export type Sorting = {
  readonly column: Column;
  readonly direction: 'Ascending' | 'Descending';
} | null;

/** What the table shows: '' means no filter. */
export type Browse = {
  readonly search: string;
  readonly diet: string;
  readonly period: string;
  readonly sorting: Sorting;
};

type Dinosaur = (typeof DINOSAURS)[number];

const KEYS: Record<Column, (d: Dinosaur) => string | number> = {
  Name: (d) => d.name,
  Period: (d) => d.period,
  Diet: (d) => d.diet,
  Length: (d) => d.lengthMeters,
  Weight: (d) => d.weightKg,
};

const compare = (a: string | number, b: string | number) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b));

/** The dinosaurs the filters let through, in the chosen order. */
export const rowsFor = (browse: Browse): ReadonlyArray<Dinosaur> => {
  const query = browse.search.toLowerCase();
  const rows = DINOSAURS.filter(
    (d) =>
      d.name.toLowerCase().includes(query) &&
      (browse.diet === '' || d.diet === browse.diet) &&
      (browse.period === '' || d.period === browse.period),
  );
  const { sorting } = browse;
  if (!sorting) return rows;
  const key = KEYS[sorting.column];
  const sign = sorting.direction === 'Ascending' ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(key(a), key(b)));
};

/** Unsorted → Ascending → Descending → Unsorted, per column. */
export const nextSorting = (sorting: Sorting, column: Column): Sorting => {
  if (sorting?.column !== column) return { column, direction: 'Ascending' };
  return sorting.direction === 'Ascending'
    ? { column, direction: 'Descending' }
    : null;
};
