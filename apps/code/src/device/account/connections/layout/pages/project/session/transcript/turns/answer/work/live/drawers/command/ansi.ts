/*
 * What a terminal would show of a command's output, read piece by piece:
 * its lines, each a run of spans in the colours and weights its ANSI
 * escape codes asked for. Only the codes that style text are kept; those
 * that move the cursor or set the title are dropped. A carriage return
 * starts its line again, so a progress bar shows as its last state. A
 * piece may end mid-code: the rest waits for the next.
 */

/** One of the terminal's sixteen colours, 0 to 15, or one of its own, as CSS. */
export type Color = number | string;

export interface Style {
  readonly fg: Color | null;
  readonly bg: Color | null;
  readonly bold: boolean;
  readonly dim: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

export interface Span {
  readonly text: string;
  readonly style: Style;
}

export type Line = ReadonlyArray<Span>;

/** What has been read so far. */
export interface Screen {
  /** The lines ended, oldest first, at most `MAX_LINES`. */
  readonly lines: ReadonlyArray<Line>;
  /** How many lines were dropped before the first kept. */
  readonly first: number;
  /** The line still being written. */
  readonly last: Line;
  readonly style: Style;
  /** A code cut off at the end of the last piece. */
  readonly rest: string;
}

/** How many lines are kept, from the end. */
export const MAX_LINES = 3000;

/** A code cut off for longer than this is not one: it is dropped. */
const MAX_REST = 4096;

export const PLAIN: Style = {
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
};

export const EMPTY: Screen = {
  lines: [],
  first: 0,
  last: [],
  style: PLAIN,
  rest: '',
};

/** Every line, the one still being written last when it has any text. */
export const linesOf = (screen: Screen): ReadonlyArray<Line> =>
  screen.last.length === 0 ? screen.lines : [...screen.lines, screen.last];

/** The xterm 256-colour palette past the sixteen, as CSS. */
const indexed = (n: number): Color => {
  if (n < 16) return n;
  if (n >= 232) {
    const grey = 8 + (n - 232) * 10;
    return `rgb(${grey} ${grey} ${grey})`;
  }
  const cube = n - 16;
  const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
  return `rgb(${level(Math.floor(cube / 36))} ${level(Math.floor(cube / 6) % 6)} ${level(cube % 6)})`;
};

const byte = (value: number | undefined) =>
  Math.max(0, Math.min(255, value ?? 0));

/** A style after one SGR code's parameters. */
export const styled = (style: Style, params: string): Style => {
  const codes = params
    .replaceAll(':', ';')
    .split(';')
    .map((each) => (each === '' ? 0 : Number(each)));
  let next = style;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) next = PLAIN;
    else if (code === 1) next = { ...next, bold: true };
    else if (code === 2) next = { ...next, dim: true };
    else if (code === 3) next = { ...next, italic: true };
    else if (code === 4) next = { ...next, underline: true };
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 23) next = { ...next, italic: false };
    else if (code === 24) next = { ...next, underline: false };
    else if (code >= 30 && code <= 37) next = { ...next, fg: code - 30 };
    else if (code >= 90 && code <= 97) next = { ...next, fg: code - 90 + 8 };
    else if (code >= 40 && code <= 47) next = { ...next, bg: code - 40 };
    else if (code >= 100 && code <= 107) next = { ...next, bg: code - 100 + 8 };
    else if (code === 39) next = { ...next, fg: null };
    else if (code === 49) next = { ...next, bg: null };
    else if (code === 38 || code === 48) {
      const key = code === 38 ? 'fg' : 'bg';
      if (codes[i + 1] === 5) {
        next = { ...next, [key]: indexed(byte(codes[i + 2])) };
        i += 2;
      } else if (codes[i + 1] === 2) {
        const [r, g, b] = [codes[i + 2], codes[i + 3], codes[i + 4]].map(byte);
        next = { ...next, [key]: `rgb(${r} ${g} ${b})` };
        i += 4;
      }
    }
  }
  return next;
};

/** Where a CSI code ends: its final byte, from `@` to `~`. */
const csiEnd = (text: string, from: number) => {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) return i;
  }
  return -1;
};

/** Where an OSC code ends, after its BEL or its ESC `\`. */
const oscEnd = (text: string, from: number) => {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\x07') return i + 1;
    if (text[i] === '\x1b' && text[i + 1] === '\\') return i + 2;
  }
  return -1;
};

/** The screen once `piece` is read. */
export const feed = (screen: Screen, piece: string): Screen => {
  const text = screen.rest + piece;
  const lines = [...screen.lines];
  let last = [...screen.last];
  let style = screen.style;
  let rest = '';
  let run = '';

  const flush = () => {
    if (run === '') return;
    const before = last.at(-1);
    last =
      before !== undefined && before.style === style
        ? [...last.slice(0, -1), { text: before.text + run, style }]
        : [...last, { text: run, style }];
    run = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '\n') {
      flush();
      lines.push(last);
      last = [];
      i += 1;
    } else if (char === '\r') {
      if (i + 1 === text.length) {
        rest = '\r';
        break;
      }
      flush();
      // `\r\n` ends the line; a `\r` alone writes it again.
      if (text[i + 1] !== '\n') last = [];
      i += 1;
    } else if (char === '\x1b') {
      const kind = text[i + 1];
      if (kind === undefined) {
        rest = text.slice(i);
        break;
      }
      if (kind === '[') {
        const end = csiEnd(text, i + 2);
        if (end === -1) {
          rest = text.slice(i);
          break;
        }
        if (text[end] === 'm') {
          flush();
          style = styled(style, text.slice(i + 2, end));
        }
        i = end + 1;
      } else if (kind === ']') {
        const end = oscEnd(text, i + 2);
        if (end === -1) {
          rest = text.slice(i);
          break;
        }
        i = end;
      } else {
        // A charset choice, such as `ESC ( B`, has one byte more.
        i += '()*+'.includes(kind) ? 3 : 2;
      }
    } else if (char === '\b') {
      flush();
      const before = last.at(-1);
      if (before !== undefined)
        last =
          before.text.length > 1
            ? [
                ...last.slice(0, -1),
                { text: before.text.slice(0, -1), style: before.style },
              ]
            : last.slice(0, -1);
      i += 1;
    } else if (char < ' ' && char !== '\t') {
      i += 1;
    } else {
      run += char;
      i += 1;
    }
  }
  flush();
  const over = Math.max(0, lines.length - MAX_LINES);
  return {
    lines: over === 0 ? lines : lines.slice(over),
    first: screen.first + over,
    last,
    style,
    rest: rest.length > MAX_REST ? '' : rest,
  };
};
