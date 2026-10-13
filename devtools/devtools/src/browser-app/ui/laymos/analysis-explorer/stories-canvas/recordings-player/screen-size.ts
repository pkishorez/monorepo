import type { Recording } from 'laymos/story/schema';

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** What a device's frame adds around its screen, across and down. */
const frame = {
  desktop: { width: 2, height: 26 },
  mobile: { width: 14, height: 14 },
} as const;
/** The Tab's name beneath its screen. */
export const captionHeight = 30;
export const screenGap = 32;

/**
 * Each Tab's screen at its viewport's aspect ratio, as tall as `area`
 * allows, all scaled down together when they would not fit side by side.
 */
export function screenSizes(
  recordings: readonly Recording[],
  area: ScreenSize,
): readonly ScreenSize[] {
  if (recordings.length === 0) return [];
  const chrome = Math.max(
    ...recordings.map((recording) => frame[recording.deviceKind].height),
  );
  const height = Math.max(80, area.height - chrome - captionHeight);
  const natural = recordings.map((recording) => ({
    width:
      (height * recording.viewport.width) /
      Math.max(1, recording.viewport.height),
    height,
  }));
  const screens = natural.reduce((sum, size) => sum + size.width, 0);
  const fixed =
    recordings.reduce(
      (sum, recording) => sum + frame[recording.deviceKind].width,
      0,
    ) +
    screenGap * (recordings.length - 1);
  const scale =
    area.width <= 0
      ? 1
      : Math.min(1, Math.max(0.1, (area.width - fixed) / Math.max(1, screens)));
  return natural.map((size) => ({
    width: size.width * scale,
    height: size.height * scale,
  }));
}
