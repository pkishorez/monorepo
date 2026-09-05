/** Star positions, as stage-relative percentages, for the night sky. */
export const STAR_POS = [
  { x: '18%', y: '24%' },
  { x: '34%', y: '14%' },
  { x: '52%', y: '30%' },
  { x: '66%', y: '18%' },
  { x: '78%', y: '38%' },
  { x: '44%', y: '46%' },
];

/** One frame of the day cycle: sky tint, sun placement, and the time-of-day label. */
export type Sky = {
  sky: string;
  sunX: string;
  sunY: string;
  /** Sun diameter as a percent of stage width — resolved to px via `cw()` in render. */
  sunSize: number;
  sunColor: string;
  glow: string;
  textColor: string;
  stars: boolean;
  label: string;
};

/** The five frames of the day cycle, dawn → night. */
export const SKIES: Sky[] = [
  {
    sky: '#1f2933',
    sunX: '12%',
    sunY: '82%',
    sunSize: 5.1,
    sunColor: '#f59e0b',
    glow: '0 0 71px 14px rgba(245,158,11,0.35)',
    textColor: '#cbd5e1',
    stars: false,
    label: 'dawn',
  },
  {
    sky: '#5b7089',
    sunX: '32%',
    sunY: '46%',
    sunSize: 5.9,
    sunColor: '#fbbf24',
    glow: '0 0 106px 25px rgba(251,191,36,0.45)',
    textColor: '#f1f5f9',
    stars: false,
    label: 'morning',
  },
  {
    sky: '#bfe1ff',
    sunX: '50%',
    sunY: '18%',
    sunSize: 8.5,
    sunColor: '#fffbe8',
    glow: '0 0 159px 46px rgba(255,247,214,0.85)',
    textColor: '#1e293b',
    stars: false,
    label: 'noon',
  },
  {
    sky: '#e29a6b',
    sunX: '70%',
    sunY: '52%',
    sunSize: 6.8,
    sunColor: '#fb7a3c',
    glow: '0 0 124px 32px rgba(251,122,60,0.5)',
    textColor: '#3b2415',
    stars: false,
    label: 'dusk',
  },
  {
    sky: '#0b1326',
    sunX: '86%',
    sunY: '28%',
    sunSize: 5.5,
    sunColor: '#e2e8f0',
    glow: '0 0 88px 18px rgba(226,232,240,0.4)',
    textColor: '#cbd5e1',
    stars: true,
    label: 'night',
  },
];
