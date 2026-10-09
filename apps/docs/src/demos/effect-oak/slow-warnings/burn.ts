/** Keep the main thread busy for `durationMs`, as Foldkit's lab does. */
export const burnCpu = (durationMs: number): number => {
  const stopAt = performance.now() + durationMs;
  let checksum = 0;
  while (performance.now() < stopAt) {
    checksum = (checksum + Math.sqrt(checksum + 1)) % 100000;
  }
  return checksum;
};

export const UPDATE_WORK_MS = 10;
export const VIEW_WORK_MS = 24;
export const PATCH_ROW_COUNT = 4000;
