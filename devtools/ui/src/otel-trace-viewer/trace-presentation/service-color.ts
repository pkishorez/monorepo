const PALETTE = [
  { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-400' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-400' },
  { bg: 'bg-violet-500/15', text: 'text-violet-300', dot: 'bg-violet-400' },
  { bg: 'bg-rose-500/15', text: 'text-rose-300', dot: 'bg-rose-400' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', dot: 'bg-fuchsia-400' },
  { bg: 'bg-lime-500/15', text: 'text-lime-300', dot: 'bg-lime-400' },
] as const;

const NEUTRAL = {
  bg: 'bg-muted',
  text: 'text-muted-foreground',
  dot: 'bg-muted-foreground',
} as const;

export type ServiceColor = (typeof PALETTE)[number] | typeof NEUTRAL;

export function serviceColor(name: string | null | undefined): ServiceColor {
  if (!name) return NEUTRAL;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}
