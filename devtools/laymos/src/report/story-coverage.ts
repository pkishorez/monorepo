export interface StoryCoverageCount {
  readonly lines: number;
  readonly percentage: number;
}

export interface StoryCoverageRange {
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly reason?: string;
}

export interface StoryCoverage {
  readonly storyPath: string;
  readonly name: string;
  readonly files: readonly string[];
  readonly functions: readonly StoryCoverageRange[];
  readonly omissions: readonly StoryCoverageRange[];
  readonly unnarratedRegions: readonly StoryCoverageRange[];
  readonly totalLines: number;
  readonly narrated: StoryCoverageCount;
  readonly omitted: StoryCoverageCount;
  readonly unnarrated: StoryCoverageCount;
}

export interface StoryCoverageReport {
  readonly invalidStories: readonly {
    readonly storyPath: string;
    readonly message: string;
  }[];
  readonly stories: readonly StoryCoverage[];
}
