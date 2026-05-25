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

export type FeatureViolationCount = {
  featureName: string;
  count: number;
};

export type FileTreeViewModel = {
  title: string;
  selectedFeature: string | null;
  stats: CoverageStatItem[];
  violations: ViolationItem[];
  featureViolationCounts: FeatureViolationCount[];
  tree: FileTreeNode[];
  treeKey: string;
  highlightedFiles: Set<string> | null;
  featureSeedFiles: Set<string> | null;
  uncoveredFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  expandedItems: string[];
  hoveredGraphFiles: Set<string> | null;
};
