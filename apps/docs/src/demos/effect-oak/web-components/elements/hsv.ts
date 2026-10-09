/* Hex colors to hue, saturation and value, and back. */

export type Hsv = {
  readonly h: number;
  readonly s: number;
  readonly v: number;
};

export const hexOf = ({ h, s, v }: Hsv): string => {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
};

/** The color of a `#rrggbb` hex, or null if it is not one. */
export const hsvOf = (hex: string): Hsv | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
    (c) => c / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const h =
    delta === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / delta + 6) % 6)
        : max === g
          ? 60 * ((b - r) / delta + 2)
          : 60 * ((r - g) / delta + 4);
  return { h, s: max === 0 ? 0 : delta / max, v: max };
};
