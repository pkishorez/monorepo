import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangedPathSchema,
  ChangeStatusSchema,
  type ChangeStatus,
} from '../../../../../../../server/rpc/git/contract/index.js';
import { UnchangedSchema } from '../../../../../../logic/shared/index.js';

const At = {
  root: Schema.String,
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
};

const FileFields = {
  path: Schema.String,
  status: Schema.NullOr(ChangeStatusSchema),
};

const FolderFields = {
  path: Schema.String,
  title: Schema.String,
  files: Schema.Array(Schema.String),
  changed: Schema.Array(ChangedPathSchema),
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
};

export const FolderSettingsSchema = Schema.Struct({
  unchanged: UnchangedSchema,
  deleted: Schema.Boolean,
  ignored: Schema.Boolean,
});
export type FolderSettings = typeof FolderSettingsSchema.Type;

export const defaultSettings: FolderSettings = {
  unchanged: 'dim',
  deleted: true,
  ignored: true,
};

const State = Schema.TaggedUnion({
  File: { base: At.base, ...FileFields },
  Folder: {
    base: At.base,
    ...FolderFields,
    selected: Schema.NullOr(Schema.String),
    showing: Schema.Boolean,
    closed: Schema.Array(Schema.String),
  },
});

export type FolderState = Extract<
  typeof State.Type,
  { readonly _tag: 'Folder' }
>;

export const ViewerShape = Actor.define('Viewer', {
  input: Schema.TaggedUnion({
    File: { ...At, ...FileFields },
    Folder: { ...At, ...FolderFields },
  }),
  props: Schema.UndefinedOr(FolderSettingsSchema),
  model: Schema.Struct({ root: At.root, branch: At.branch }),
  state: State,
  message: Schema.TaggedUnion({
    Selected: { path: Schema.String },
    Stepped: { by: Schema.Number },
    FolderToggled: { path: Schema.String },
    AllToggled: {},
    InsideToggled: { path: Schema.String },
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
    WentBack: {},
    Closed: {},
  }),
  emits: {
    Closed: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
  },
});

export interface FolderEntry {
  readonly path: string;
  readonly status: ChangeStatus | null;
  readonly ignored: boolean;
}

export type FileTreeRow =
  | {
      readonly kind: 'folder';
      readonly path: string;
      readonly label: string;
      readonly depth: number;
      readonly open: boolean;
      readonly status: ChangeStatus | null;
    }
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly name: string;
      readonly depth: number;
      readonly status: ChangeStatus | null;
    };
