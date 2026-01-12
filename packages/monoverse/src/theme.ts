interface ThemeColors {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
}

const draculaColors: ThemeColors = {
  primary: "#50fa7b",
  accent: "#bd93f9",
  success: "#50fa7b",
  warning: "#f1fa8c",
  error: "#ff5555",
  muted: "#6272a4",
};

export const colors: ThemeColors = draculaColors;

const toAnsi = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
};

interface Theme {
  reset: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
}

export const theme: Theme = {
  reset: "\x1b[0m",
  primary: toAnsi(colors.primary),
  accent: toAnsi(colors.accent),
  success: toAnsi(colors.success),
  warning: toAnsi(colors.warning),
  error: toAnsi(colors.error),
  muted: toAnsi(colors.muted),
};
