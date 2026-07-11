export type Accent = {
  hue: number;
  /** A translucent surface fill, e.g. for accordion headers. */
  surface: string;
  /** A solid-ish bar/segment fill. */
  solid: string;
  /** A border / ring color. */
  border: string;
  /** Readable foreground text on top of the app. */
  text: string;
};

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function collectionAccent(collectionName: string): Accent {
  const hue = hashHue(collectionName);
  return {
    hue,
    surface: `hsl(${hue} 70% 55% / 0.12)`,
    solid: `hsl(${hue} 70% 60% / 0.85)`,
    border: `hsl(${hue} 70% 60% / 0.35)`,
    text: `hsl(${hue} 65% 72%)`,
  };
}

export type Tone = {
  /** Background fill (translucent). */
  bg: string;
  /** Foreground/border accent. */
  fg: string;
};

export function statusTone(status: string): Tone {
  switch (status) {
    case 'active':
    case 'ready':
    case 'live':
      return { bg: 'hsl(142 70% 45% / 0.15)', fg: 'hsl(142 65% 65%)' };
    case 'idle':
      return { bg: 'hsl(220 10% 60% / 0.12)', fg: 'hsl(220 10% 70%)' };
    case 'loading':
    case 'syncing':
      return { bg: 'hsl(38 90% 55% / 0.15)', fg: 'hsl(38 85% 65%)' };
    case 'error':
      return { bg: 'hsl(0 75% 55% / 0.15)', fg: 'hsl(0 75% 70%)' };
    default:
      return { bg: 'hsl(220 10% 60% / 0.12)', fg: 'hsl(220 10% 70%)' };
  }
}

export function strategyTone(
  strategy: 'oldToNew' | 'newToOld' | 'bidirectional',
): Tone {
  switch (strategy) {
    case 'newToOld':
      return { bg: 'hsl(265 70% 60% / 0.15)', fg: 'hsl(265 70% 72%)' };
    case 'bidirectional':
      return { bg: 'hsl(160 65% 50% / 0.15)', fg: 'hsl(160 60% 62%)' };
    default:
      return { bg: 'hsl(195 70% 55% / 0.15)', fg: 'hsl(195 70% 68%)' };
  }
}
