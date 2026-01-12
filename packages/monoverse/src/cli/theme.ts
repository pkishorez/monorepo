interface Theme {
  reset: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
}

const dracula: Theme = {
  reset: "\x1b[0m",
  primary: "\x1b[38;2;80;250;123m",
  accent: "\x1b[38;2;189;147;249m",
  success: "\x1b[38;2;80;250;123m",
  warning: "\x1b[38;2;241;250;140m",
  error: "\x1b[38;2;255;85;85m",
  muted: "\x1b[38;2;98;114;164m",
};

export const theme: Theme = dracula;
