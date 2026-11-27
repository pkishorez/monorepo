import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  FolderListingSchema,
  FolderSchema,
  ProjectEntrySchema,
  type Folder,
  type ProjectEntry,
} from '../../../../../server/rpc/projects/contract/index.js';
import { Projects } from '../../../../../services/projects/contract/index.js';

export const KindSchema = Schema.NullOr(
  Schema.Literals(['monorepo', 'package']),
);
export type Kind = typeof KindSchema.Type;

export const ListingSchema = Schema.Struct({
  query: Schema.String,
  hidden: Schema.Boolean,
  path: Schema.String,
  kind: KindSchema,
  folders: Schema.Array(FolderSchema),
  truncated: Schema.Boolean,
  problem: Schema.NullOr(Schema.String),
});
export type Listing = typeof ListingSchema.Type;

export const FolderStepSchema = Schema.Struct({
  segments: Schema.Array(Schema.String),
  query: Schema.String,
  highlighted: Schema.String,
  listing: Schema.NullOr(ListingSchema),
});
export type FolderStep = typeof FolderStepSchema.Type;

export const ModelSchema = Schema.Struct({
  current: Schema.NullOr(Schema.String),
  home: Schema.NullOr(Schema.String),
  homeListing: Schema.NullOr(ListingSchema),
  recent: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  recentProblem: Schema.NullOr(Schema.String),
  query: Schema.String,
  highlighted: Schema.String,
  folders: Schema.Array(FolderStepSchema),
  removing: Schema.Array(Schema.String),
  adding: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
});
export type Model = typeof ModelSchema.Type;

export const OPEN_FOLDER = 'open-folder';

export const ProjectPickerShape = Actor.define('ProjectPicker', {
  requires: [Projects],
  input: Schema.Struct({ current: Schema.NullOr(Schema.String) }),
  props: Schema.UndefinedOr(
    Schema.Struct({
      current: Schema.NullOr(Schema.String),
    }),
  ),
  model: ModelSchema,
  message: Schema.TaggedUnion({
    Typed: { query: Schema.String },
    Moved: { by: Schema.Finite },
    Highlighted: { value: Schema.String },
    Picked: { value: Schema.String },
    Chose: { on: Schema.NullOr(Schema.String) },
    WentBack: {},
    WentBackTo: { depth: Schema.Finite },
    Dismissed: {},
    RemoveAsked: { id: Schema.String },
    Removed: { id: Schema.String },
    RemoveRefused: { id: Schema.String, problem: Schema.String },
    Added: { project: ProjectEntrySchema },
    AddRefused: { problem: Schema.String },
    RecentRead: { projects: Schema.Array(ProjectEntrySchema) },
    RecentRefused: { problem: Schema.String },
    Retried: {},
    HomeFound: { listing: FolderListingSchema },
    Loaded: {
      segments: Schema.Array(Schema.String),
      listing: ListingSchema,
      home: Schema.NullOr(Schema.String),
    },
  }),
  emits: {
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
  },
});

export interface Ranked<T> {
  readonly entry: T;
  readonly matched: ReadonlyArray<number>;
}

export type Row =
  | {
      readonly _tag: 'Project';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
      readonly project: ProjectEntry;
      readonly current: boolean;
    }
  | {
      readonly _tag: 'OpenFolder';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
    }
  | {
      readonly _tag: 'Folder';
      readonly value: string;
      readonly label: string;
      readonly folder: Folder;
    };

export interface Group {
  readonly heading: string | null;
  readonly rows: ReadonlyArray<Ranked<Row>>;
}

export interface Shown {
  readonly step: 'recent' | 'folder';
  readonly groups: ReadonlyArray<Group>;
  readonly rows: ReadonlyArray<Row>;
  readonly loading: boolean;
  readonly problem: string | null;
  readonly empty: string | null;
  readonly hint: string | null;
  readonly placeholder: string;
  readonly truncated: boolean;
  readonly where: {
    readonly crumbs: ReadonlyArray<string>;
    readonly path: string | null;
    readonly kind: Kind;
  } | null;
}
