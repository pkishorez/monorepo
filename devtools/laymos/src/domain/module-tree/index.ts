// Analysis reads the Module tree out of the analyzed file list.
export { buildModuleTree } from './module-tree.js';
// Readers of a tree walk it by path.
export {
  ancestorsOf,
  isAncestor,
  modulesWithin,
  nodeByPath,
  rootPath,
} from './module-tree.js';
