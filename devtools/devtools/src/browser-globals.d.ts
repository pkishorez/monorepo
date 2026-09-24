declare const __DEVTOOLS_VERSION__: string;

interface Window {
  /** The Snapshot Request the `devtools snapshot` command injects. */
  __DEVTOOLS_SNAPSHOT__?: unknown;
}
