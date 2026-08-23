export interface Opening {
  readonly name: string;
  readonly balance: number;
}

export const MAX_OPENING_BALANCE = 10_000;
export const DEFAULT_OPENING_BALANCE = 500;
export const DEFAULT_SEED_COUNT = 8;
export const MAX_SEED_COUNT = 100_000;

export const mono = 'font-mono tracking-tight tabular-nums';
export const bare =
  'border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/40';
export const textLink =
  'rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground';

export const digitsOnly = (raw: string): string => raw.replace(/[^0-9]/g, '');

export const parseAmount = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export const chWidth = (raw: string): { width: string } => ({
  width: `${Math.max(1, raw.length)}ch`,
});
export const eyebrow =
  'text-[0.6875rem] leading-none tracking-widest text-muted-foreground uppercase';
