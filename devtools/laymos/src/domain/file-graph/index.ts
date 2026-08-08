// The raw file-dependency graph a Cruiser produces, and the type every
// dependency query is computed from.
export type { FileGraph } from './file-graph.js';
// One dependency in a query's result, tagged by how far it is from the
// target.
export type { DependencyEntry, DependencyQueryOptions } from './file-graph.js';
// Direct + recursive dependencies of a single file, excluding the file
// itself.
export { fileDependencies } from './file-graph.js';
// Direct + recursive dependencies of every file under a folder, excluding
// the folder's own members.
export { folderDependencies } from './file-graph.js';
// A single node in a path-grouped dependency tree, tagged 'target' at the
// query target's own position and 'direct'/'recursive' at dependency leaves.
export type { PathTreeNode, PathTreeNodeKind } from './file-graph.js';
// Groups the target and its dependencies into a nested tree by shared
// directory prefix.
export { groupByPath } from './file-graph.js';
