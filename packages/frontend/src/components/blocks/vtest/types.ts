/**
 * Run status of a documented test or suite. Mirrors `TestStatus` from
 * `@monorepo/vtest/analysis` 1:1 so the route can wire RPC values directly;
 * declared locally to keep this presentational block decoupled from vtest's
 * Node-only analysis sources.
 */
export type TestStatus = 'pass' | 'fail' | 'skip' | 'pending' | 'running';

/**
 * A static validation result about the doc-test contract. Mirrors `Diagnostic`
 * from `@monorepo/vtest/analysis` 1:1.
 */
export interface Diagnostic {
  readonly level: 'error' | 'warning';
  readonly feature?: string;
  readonly groupId?: string;
  readonly message: string;
}

/** A package curated onto the vtest home screen. */
export interface VtestPackage {
  /** Stable identifier (usually the package name). */
  readonly id: string;
  /** Human-readable package name. */
  readonly name: string;
  /** Filesystem path the package was added from. */
  readonly path: string;
  /** Number of documented features (folders), for the card summary. */
  readonly featureCount: number;
}

/** A documented unit the user drills into (rendered as a "folder"). */
export interface VtestFolder {
  /** Feature name (matches a toc entry). */
  readonly name: string;
  /** Optional one-line summary shown in the list. */
  readonly summary?: string;
  /** Roll-up health of the folder's test groups. */
  readonly health?: VtestHealth;
}

/** A named toc section grouping folders in reading order. */
export interface VtestSection {
  readonly title: string;
  readonly folders: readonly VtestFolder[];
}

/** A single documented test inside a group (matches the RPC `tests[]` shape). */
export interface VtestTest {
  readonly name: string;
  readonly vdoc: string | null;
  /** Run status; `pending` when no run record exists. */
  readonly status: TestStatus;
  /** Wall-clock run duration in milliseconds, when known. */
  readonly durationMs?: number;
  /** Failure message, when the test failed. */
  readonly error?: string;
  /** Relative source file the test was statically extracted from. */
  readonly file: string;
  /** 1-based line of the `vtest(`/`test(` call. */
  readonly startLine: number;
  /** 1-based line of the matching close paren of that call. */
  readonly endLine: number;
}

/** A test source file backing a group, served verbatim for the code viewer. */
export interface VtestFile {
  /** File name relative to the group directory (e.g. `chunk.test.ts`). */
  readonly path: string;
  /** Full source of the file. */
  readonly source: string;
}

/** A test group as returned by the RPC `GetFeature` response. */
export interface VtestGroup {
  readonly id: string;
  readonly tests: readonly VtestTest[];
  /** Backing source files, for the in-page code viewer. */
  readonly files: readonly VtestFile[];
}

/** A directive occurrence marking where a group renders in the markdown. */
export interface VtestDirective {
  readonly id: string;
  readonly offset: number;
}

/**
 * The feature-page payload, matching the RPC `GetFeature` response so the
 * route can wire it 1:1 later.
 */
export interface VtestFeature {
  /** Feature name (page title). */
  readonly name: string;
  /** Full `doc.md` markdown. */
  readonly markdown: string;
  /** Directive occurrences inside `markdown`. */
  readonly directives: readonly VtestDirective[];
  /** Test groups referenced by the directives. */
  readonly groups: readonly VtestGroup[];
  /** Static validation results for this feature. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Roll-up health of a feature or folder. */
export type VtestHealth = 'pass' | 'fail' | 'pending' | 'unknown';

/** A named toc section listing its features in reading order. */
export interface TocSection {
  readonly title: string;
  readonly features: readonly string[];
}

/**
 * The full payload for the reader view: a package's table of contents and every
 * documented feature with its markdown, directives, diagnostics, and resolved
 * test groups. Mirrors the DevTools `RunVtest` success payload (the
 * `available: true` branch) field-for-field so the route can pass it 1:1.
 */
export interface VtestConfig {
  readonly package: { readonly name: string; readonly dir: string };
  /** The package's `home.md` overview prose, or `null`/absent when it ships none. */
  readonly overview?: string | null;
  readonly toc: { readonly sections: readonly TocSection[] };
  readonly features: readonly VtestConfigFeature[];
}

/** A documented feature inside a {@link VtestConfig}. */
export interface VtestConfigFeature {
  readonly name: string;
  readonly markdown: string;
  readonly directives: readonly VtestDirective[];
  readonly diagnostics: readonly Diagnostic[];
  readonly groups: readonly VtestGroup[];
}
