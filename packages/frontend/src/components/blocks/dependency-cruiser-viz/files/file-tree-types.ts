import type { TreeViewElement } from '#components/ui/file-tree';

export type FileStatus = 'covered' | 'violation' | 'orphan' | 'ignored';

export type FileTreeNode = TreeViewElement & {
  status?: FileStatus;
  children?: FileTreeNode[];
};

export type ViolationItem = {
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
};

export type CoverageStatItem = {
  key: string;
  status: FileStatus;
  count: number;
  label: string;
  hidden?: boolean;
  muted?: boolean;
};

export type FileTreeViewModel = {
  title: string;
  isFeatureView: boolean;
  selectedLayer: string | null;
  selectedLayerPaths: string[] | null;
  selectedFeature: string | null;
  hideIrrelevantFiles: boolean;
  stats: CoverageStatItem[];
  violations: ViolationItem[];
  tree: FileTreeNode[];
  treeKey: string;
  highlightedFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  statusOverrides: Map<string, FileStatus> | null;
  expandedItems: string[];
};
