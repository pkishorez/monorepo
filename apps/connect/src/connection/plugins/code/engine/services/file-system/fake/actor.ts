import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  addBranch,
  addOriginBranch,
  GIT_FAILS_NEXT,
  GIT_MISSING,
  pushBranch,
  sampleProject,
  switchBranch,
} from './git.js';
import { dirname, fromHome, join } from './paths.js';
import {
  changeFolder,
  Encoding,
  ensureFolders,
  put,
  remove,
  subtree,
  textFile,
  Tree,
  treeWith,
} from './tree.js';

/*
 * One computer's File System, faked: a Kabuki Actor that Requires nothing
 * and starts blank, an empty home at `/home/you`. Its Model is the whole
 * tree (tree.ts), so its Snapshot is the disk: saved, it comes back as it
 * was. A folder removed by a Control is put away whole, to be put back.
 *
 * Every change is a Message. The app's own changes come from the layer
 * (serve.ts), which picks a failure from the tree before it Sends, so the
 * three Messages it Sends only ever land: FolderMade, FileWritten,
 * PathRemoved. The rest are Controls, in a person's words, for the bubble;
 * a Control always lands, and does nothing only where there is nothing for
 * it to do. A path in a Control is written as a person would: `~/code`,
 * `code` (from home) or absolute. Git's Controls change the repository's
 * `.git` as git would (git.ts).
 */

/** The home of a blank computer. */
export const HOME = '/home/you';

const Model = Schema.Struct({
  /** The user's home folder. */
  home: Schema.String,
  /** Every entry, by its absolute path. */
  tree: Tree,
  /** Each folder removed by a Control, by its path, with all it held. */
  putAway: Schema.Record(Schema.String, Tree),
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
  /** A hidden folder, `.<name>`, in a folder. */
  AddHiddenFolder: { in: Path, name: Schema.String },
  /** `count` folders, `folder-001` and on, in a folder: over 100 to fill a listing. */
  AddManyFolders: { in: Path, count: Schema.Int },
  /** A file holding the text given. */
  AddFile: { file: Path, text: Schema.String },
  /** A symlink at `at` to `to`, inside home or outside it. */
  AddSymlink: { at: Path, to: Path },
  /** The folder may no longer be listed or gone into, as `chmod 000`. */
  MakeUnreadable: { folder: Path },
  /** Listing the folder fails, as a failing disk would. */
  MakeFailToList: { folder: Path },
  /** Listing the folder takes long, as a slow disk or a network folder would. */
  MakeSlowToList: { folder: Path },
  /** The folder is readable again, and lists again, at once. */
  MakeReadable: { folder: Path },
  /** The folder is gone, as if moved away, with all it held. */
  RemoveFolder: { folder: Path },
  /** A folder removed before is back where it was. */
  PutFolderBack: { folder: Path },
  /** The project is on another branch, switched outside Code. */
  SwitchBranch: { project: Path, branch: Schema.String },
  /** The project has a new local branch. */
  AddBranch: { project: Path, branch: Schema.String },
  /** The project's Origin has a new branch, seen after the next fetch. */
  AddOriginBranch: { project: Path, branch: Schema.String },
  /** A local branch was pushed to Origin. */
  PushBranch: { project: Path, branch: Schema.String },
  /** The next git step that changes something fails, git saying `message`. */
  MakeNextGitStepFail: { message: Schema.String },
  /** git is not installed on this computer. */
  MakeGitMissing: {},
  /** git is installed again. */
  InstallGit: {},
});
export type FileSystemMessage = typeof Message.Type;

/** The Messages the bubble offers, a person's Controls. */
export const CONTROLS = [
  'AddSampleProject',
  'AddFolder',
  'AddHiddenFolder',
  'AddManyFolders',
  'AddFile',
  'AddSymlink',
  'MakeUnreadable',
  'MakeFailToList',
  'MakeSlowToList',
  'MakeReadable',
  'RemoveFolder',
  'PutFolderBack',
  'SwitchBranch',
  'AddBranch',
  'AddOriginBranch',
  'PushBranch',
  'MakeNextGitStepFail',
  'MakeGitMissing',
  'InstallGit',
] as const satisfies ReadonlyArray<FileSystemMessage['_tag']>;

/** A blank computer: `/home/you`, empty. */
export const blank = (): FileSystemModel => ({
  home: HOME,
  tree: treeWith(HOME),
  putAway: {},
});

/** The most folders one AddManyFolders makes. */
const MOST_AT_ONCE = 1000;

/** The name `name` made hidden, its `/` dropped. */
const hiddenName = (name: string) =>
  `.${name.replaceAll('/', '').replace(/^\.+/, '') || 'hidden'}`;

const numbered = (index: number, count: number) =>
  `folder-${String(index).padStart(Math.max(3, String(count).length), '0')}`;

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
    AddHiddenFolder: ({ in: inside, name }, { model }) => ({
      model: {
        tree: ensureFolders(
          model.tree,
          join(fromHome(model.home, inside), hiddenName(name)),
        ),
      },
    }),
    AddManyFolders: ({ in: inside, count }, { model }) => {
      const folder = fromHome(model.home, inside);
      const many = Math.min(Math.max(count, 0), MOST_AT_ONCE);
      let tree = ensureFolders(model.tree, folder);
      for (let index = 1; index <= many; index++)
        tree = ensureFolders(tree, join(folder, numbered(index, many)));
      return { model: { tree } };
    },
    AddFile: ({ file, text }, { model }) => ({
      model: {
        tree: put(model.tree, fromHome(model.home, file), textFile(text)),
      },
    }),
    AddSymlink: ({ at, to }, { model }) => ({
      model: {
        tree: put(model.tree, fromHome(model.home, at), {
          _tag: 'Symlink',
          target: fromHome(model.home, to),
        }),
      },
    }),
    MakeUnreadable: ({ folder }, { model }) => ({
      model: {
        tree: changeFolder(model.tree, fromHome(model.home, folder), {
          unreadable: true,
        }),
      },
    }),
    MakeFailToList: ({ folder }, { model }) => ({
      model: {
        tree: changeFolder(model.tree, fromHome(model.home, folder), {
          failing: true,
        }),
      },
    }),
    MakeSlowToList: ({ folder }, { model }) => ({
      model: {
        tree: changeFolder(model.tree, fromHome(model.home, folder), {
          slow: true,
        }),
      },
    }),
    MakeReadable: ({ folder }, { model }) => ({
      model: {
        tree: changeFolder(model.tree, fromHome(model.home, folder), {
          unreadable: false,
          failing: false,
          slow: false,
        }),
      },
    }),
    RemoveFolder: ({ folder }, { model }) => {
      const path = fromHome(model.home, folder);
      if (path === '/' || model.tree[path] === undefined) return {};
      return {
        model: {
          tree: remove(model.tree, path),
          putAway: { ...model.putAway, [path]: subtree(model.tree, path) },
        },
      };
    },
    PutFolderBack: ({ folder }, { model }) => {
      const path = fromHome(model.home, folder);
      const kept = model.putAway[path];
      if (kept === undefined) return {};
      const putAway = Object.fromEntries(
        Object.entries(model.putAway).filter(([at]) => at !== path),
      );
      return {
        model: {
          tree: {
            ...ensureFolders(remove(model.tree, path), dirname(path)),
            ...kept,
          },
          putAway,
        },
      };
    },
    SwitchBranch: ({ project, branch }, { model }) => ({
      model: {
        tree: switchBranch(model.tree, fromHome(model.home, project), branch),
      },
    }),
    AddBranch: ({ project, branch }, { model }) => ({
      model: {
        tree: addBranch(model.tree, fromHome(model.home, project), branch),
      },
    }),
    AddOriginBranch: ({ project, branch }, { model }) => ({
      model: {
        tree: addOriginBranch(
          model.tree,
          fromHome(model.home, project),
          branch,
        ),
      },
    }),
    PushBranch: ({ project, branch }, { model }) => ({
      model: {
        tree: pushBranch(model.tree, fromHome(model.home, project), branch),
      },
    }),
    MakeNextGitStepFail: ({ message }, { model }) => ({
      model: {
        tree: put(
          model.tree,
          GIT_FAILS_NEXT,
          textFile(message.trim() || 'fatal: the fake git step failed'),
        ),
      },
    }),
    MakeGitMissing: (_, { model }) => ({
      model: { tree: put(model.tree, GIT_MISSING, textFile('')) },
    }),
    InstallGit: (_, { model }) => ({
      model: { tree: remove(model.tree, GIT_MISSING) },
    }),
  },
});
