import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { sampleProject } from './git.js';
import { fromHome } from './paths.js';
import {
  Encoding,
  ensureFolders,
  put,
  remove,
  textFile,
  Tree,
  treeWith,
} from './tree.js';

/*
 * One computer's File System, faked: a Kabuki Actor that Requires nothing
 * and starts blank, an empty home at `/home/you`. Its Model is the whole
 * tree (tree.ts), so its Snapshot is the disk: saved, it comes back as it
 * was.
 *
 * Every change is a Message. The app's own changes come from the layer
 * (serve.ts), which finds what is in the way before it Sends, so the three
 * Messages it Sends only ever land: FolderMade, FileWritten, PathRemoved.
 * The rest are Controls, in a person's words, for the bubble: a sample
 * project, a folder, a file. A path in a Control is written as a person
 * would: `~/code`, `code` (from home) or absolute.
 */

/** The home of a blank computer. */
export const HOME = '/home/you';

const Model = Schema.Struct({
  /** The user's home folder. */
  home: Schema.String,
  /** Every entry, by its absolute path. */
  tree: Tree,
});
export type FileSystemModel = typeof Model.Type;

/** A path as a person writes it: `~/code/shop`, `code/shop` or `/srv/x`. */
const Path = Schema.String;

export const Message = Schema.TaggedUnion({
  // What the app does, Sent by the layer once it found nothing in the way.
  /** A folder was made, with every folder on the way. */
  FolderMade: { path: Schema.String },
  /** A file was written. */
  FileWritten: {
    path: Schema.String,
    data: Schema.String,
    encoding: Encoding,
  },
  /** What was at a path is gone, and all in it. */
  PathRemoved: { path: Schema.String },

  // Controls.
  /** A project with a few files and a git repository on `main`, with branches and an Origin. */
  AddSampleProject: { folder: Path },
  /** A folder, with every folder on the way; one named `.something` is hidden. */
  AddFolder: { folder: Path },
  /** A file holding the text given. */
  AddFile: { file: Path, text: Schema.String },
});
export type FileSystemMessage = typeof Message.Type;

/** The Messages the bubble offers, a person's Controls. */
export const CONTROLS = [
  'AddSampleProject',
  'AddFolder',
  'AddFile',
] as const satisfies ReadonlyArray<FileSystemMessage['_tag']>;

/** A blank computer: `/home/you`, empty. */
export const blank = (): FileSystemModel => ({
  home: HOME,
  tree: treeWith(HOME),
});

export const FileSystemFake = Actor.define('FileSystem', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    FolderMade: ({ path }, { model }) => ({
      model: { tree: ensureFolders(model.tree, path) },
    }),
    FileWritten: ({ path, data, encoding }, { model }) => ({
      model: { tree: put(model.tree, path, { _tag: 'File', data, encoding }) },
    }),
    PathRemoved: ({ path }, { model }) => ({
      model: { tree: remove(model.tree, path) },
    }),

    AddSampleProject: ({ folder }, { model }) => ({
      model: { tree: sampleProject(model.tree, fromHome(model.home, folder)) },
    }),
    AddFolder: ({ folder }, { model }) => ({
      model: { tree: ensureFolders(model.tree, fromHome(model.home, folder)) },
    }),
    AddFile: ({ file, text }, { model }) => ({
      model: {
        tree: put(model.tree, fromHome(model.home, file), textFile(text)),
      },
    }),
  },
});
