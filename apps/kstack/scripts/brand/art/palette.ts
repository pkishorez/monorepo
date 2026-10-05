import { createTheme } from '@kstackz/ui-toolkit/components/blocks/theme';

// The dark theme, as plain sRGB for images. The background is ui-toolkit's
// own; the two text colours are its dark `--foreground` (oklch 0.985 0 0)
// and `--muted-foreground` (oklch 0.708 0 0), which it gives only as CSS.
export const INK = createTheme().manifest('dark').background_color;
export const PAPER = '#fafafa';
export const MUTED = '#a1a1a1';
