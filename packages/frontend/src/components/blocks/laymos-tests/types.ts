import type { ReactNode } from 'react';
import type { TestsReport } from 'laymos/report';

export interface LaymosTestSourceTarget {
  readonly filePath: string;
  readonly testName: string;
  readonly line: number;
  readonly column: number;
}

export type LaymosTestSelection =
  | {
      readonly kind: 'group';
      readonly authorship: 'laymos' | 'vitest';
    }
  | {
      readonly kind: 'module';
      readonly authorship: 'laymos' | 'vitest';
      readonly moduleId: string;
    }
  | {
      readonly kind: 'suite';
      readonly authorship: 'laymos' | 'vitest';
      readonly suitePath: readonly string[];
    }
  | {
      readonly kind: 'case';
      readonly authorship: 'laymos' | 'vitest';
      readonly moduleId: string;
      readonly caseId: string;
    };

export interface LaymosTestsProps {
  readonly report?: TestsReport;
  /** @deprecated Use selectedTest. */
  readonly selectedModuleId?: string | null;
  /** @deprecated Use onSelectedTestChange. */
  readonly onSelectedModuleIdChange?: (moduleId: string) => void;
  readonly selectedTest?: LaymosTestSelection | null;
  readonly onSelectedTestChange?: (
    selection: LaymosTestSelection | null,
  ) => void;
  readonly onRunTests?: () => void;
  readonly renderSource?: (target: LaymosTestSourceTarget) => ReactNode;
  readonly running?: boolean;
  readonly navigationWidth?: number;
  readonly onNavigationWidthChange?: (width: number) => void;
  readonly navigationCollapsed?: boolean;
  readonly onNavigationCollapsedChange?: (collapsed: boolean) => void;
  readonly traceSidebarWidth?: number;
  readonly onTraceSidebarWidthChange?: (width: number) => void;
  readonly traceShowLogs?: boolean;
  readonly onTraceShowLogsChange?: (show: boolean) => void;
  readonly className?: string;
}
