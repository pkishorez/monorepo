import type { TestCatalog, TestPath, TestsReport } from 'laymos/report';

export type LaymosTestStringView = 'auto' | 'text' | 'markdown' | 'code';
export type LaymosTestComparisonLayout = 'side-by-side' | 'stacked';
export type LaymosTestCodeLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'yaml'
  | 'bash'
  | 'sql'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp';

export interface LaymosTestsProps {
  readonly catalog: TestCatalog;
  readonly report?: TestsReport;
  readonly selectedTestPath?: TestPath | null;
  readonly onSelectedTestPathChange?: (testPath: TestPath) => void;
  readonly onRunTest?: (testPath: TestPath) => void;
  readonly onRunAll?: () => void;
  readonly runningTestPath?: TestPath | null;
  readonly runningAll?: boolean;
  readonly className?: string;
}
