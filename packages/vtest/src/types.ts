export type TestStatus = 'pass' | 'fail' | 'skip' | 'todo' | 'running';

export type TestError = {
  message: string;
  stack?: string;
  expected?: string;
  actual?: string;
};

export type SourceLocation = {
  line: number;
  column: number;
};

export type TestNode = {
  kind: 'test';
  name: string;
  status: TestStatus;
  duration?: number;
  doc?: string;
  error?: TestError;
  location?: SourceLocation;
  /** Source snippet for the test body, dedented. */
  snippet?: string;
  /** 1-based line number in the original file where `snippet` begins. */
  snippetStartLine?: number;
};

export type SuiteLocation = SourceLocation;

export type SuiteNode = {
  kind: 'suite';
  name: string;
  doc?: string;
  children: Array<SuiteNode | TestNode>;
};

export type FileNode = {
  kind: 'file';
  name: string;
  filepath: string;
  doc?: string;
  children: Array<SuiteNode | TestNode>;
};

export type PackageMeta = {
  name: string;
  version: string;
  description?: string;
};

export type ReportSummary = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
};

// A documentation page attached to a folder in the file tree (derived from
// the file paths). Lets a folder be selectable and render its own markdown.
export type FolderDoc = {
  path: string; // e.g. "vtest/parser" — must match the directory portion of FileNode.filepath
  name?: string; // optional display name; defaults to the last path segment
  doc: string; // markdown body
};

export type VTestReport = {
  package: PackageMeta;
  home?: string;
  files: FileNode[];
  folders?: FolderDoc[];
  summary: ReportSummary;
};
