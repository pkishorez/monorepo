export interface PrintOptions {
  readonly width?: number;
  readonly depth?: number;
}

export interface PrintedLine {
  readonly indent: number;
  readonly text: string;
  readonly path: ReadonlyArray<string | number>;
}

interface Limits {
  readonly width: number;
  readonly depth: number;
}

const WIDTH = 80;
const DEPTH = 6;
const ITEMS = 20;
const CHARS = 200;
const INDENT = '  ';

type Path = ReadonlyArray<string | number>;

type Holder = ReadonlyArray<unknown> | Readonly<Record<string, unknown>>;

const isHolder = (value: unknown): value is Holder =>
  typeof value === 'object' && value !== null;

const partsOf = (
  value: Holder,
): ReadonlyArray<readonly [string | number, unknown]> =>
  Array.isArray(value)
    ? value.map((one, index) => [index, one] as const)
    : Object.entries(value);

const WORDS = new Set(['true', 'false', 'null', 'undefined', '~', 'yes', 'no']);

const LEADS = new Set([
  '-',
  '[',
  ']',
  '{',
  '}',
  '"',
  "'",
  '#',
  '&',
  '*',
  '!',
  '|',
  '>',
  '%',
  '@',
  '`',
  ',',
  '?',
]);

const controlled = (text: string) =>
  [...text].some((one) => one.charCodeAt(0) < 32 || one === '\u007f');

const ambiguous = (text: string, inline: boolean) =>
  text === '' ||
  text !== text.trim() ||
  WORDS.has(text.toLowerCase()) ||
  !Number.isNaN(Number(text)) ||
  LEADS.has(text[0]!) ||
  text.endsWith(':') ||
  text.includes(': ') ||
  text.includes(' #') ||
  controlled(text) ||
  (inline && /[,[\]{}]/.test(text));

const cut = (text: string) =>
  text.length > CHARS
    ? { shown: text.slice(0, CHARS), more: `…(${text.length} chars)` }
    : { shown: text, more: '' };

const stringText = (text: string, inline: boolean) => {
  const { shown, more } = cut(text);
  return `${ambiguous(shown, inline) ? JSON.stringify(shown) : shown}${more}`;
};

const scalarText = (value: unknown, inline: boolean): string => {
  switch (typeof value) {
    case 'string':
      return stringText(value, inline);
    case 'bigint':
      return `${value}n`;
    case 'undefined':
      return 'undefined';
    case 'function':
      return `ƒ ${value.name || 'anonymous'}`;
    case 'symbol':
      return value.toString();
    default:
      return String(value);
  }
};

const keyText = (key: string | number) =>
  typeof key === 'number' || /^[\w$./#@-]+$/.test(key)
    ? `${key}`
    : JSON.stringify(key);

const counted = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

const foldedText = (value: Holder) =>
  Array.isArray(value)
    ? `[…${counted(value.length, 'item')}]`
    : `{…${counted(Object.keys(value).length, 'key')}}`;

const flat = (
  value: unknown,
  depth: number,
  room: number,
  limits: Limits,
): string | undefined => {
  if (!isHolder(value)) {
    const text = scalarText(value, true);
    return text.length <= room ? text : undefined;
  }
  const parts = partsOf(value);
  if (parts.length === 0) return Array.isArray(value) ? '[]' : '{}';
  if (depth >= limits.depth) return foldedText(value);
  const list = Array.isArray(value);
  const texts: Array<string> = [];
  let used = list ? 2 : 4;
  for (const [key, one] of parts.slice(0, ITEMS)) {
    const lead = list ? '' : `${keyText(key)}: `;
    const text = flat(one, depth + 1, room - used - lead.length, limits);
    if (text === undefined) return undefined;
    texts.push(`${lead}${text}`);
    used += lead.length + text.length + 2;
    if (used > room + 2) return undefined;
  }
  if (parts.length > ITEMS) texts.push(`… ${parts.length - ITEMS} more`);
  const text = list ? `[${texts.join(', ')}]` : `{ ${texts.join(', ')} }`;
  return text.length <= room ? text : undefined;
};

const block = (
  value: unknown,
  indent: number,
  depth: number,
  path: Path,
  lead: string,
  limits: Limits,
  out: Array<PrintedLine>,
): void => {
  if (!isHolder(value)) {
    out.push({ indent, text: `${lead}${scalarText(value, false)}`, path });
    return;
  }
  const fields =
    lead === '' && !Array.isArray(value) && partsOf(value).length > 0;
  const room = limits.width - indent * INDENT.length - lead.length;
  const one = fields ? undefined : flat(value, depth, room, limits);
  if (one !== undefined) {
    out.push({ indent, text: `${lead}${one}`, path });
    return;
  }
  if (depth >= limits.depth) {
    out.push({ indent, text: `${lead}${foldedText(value)}`, path });
    return;
  }
  const parts = partsOf(value);
  const list = Array.isArray(value);
  const inside = lead === '' ? indent : indent + 1;
  const lines: Array<PrintedLine> = [];
  for (const [key, child] of parts.slice(0, ITEMS))
    block(
      child,
      inside,
      depth + 1,
      [...path, key],
      list ? '- ' : `${keyText(key)}: `,
      limits,
      lines,
    );
  if (parts.length > ITEMS)
    lines.push({
      indent: inside,
      text: `… ${parts.length - ITEMS} more`,
      path,
    });
  const first = lines[0];
  if (
    lead === '- ' &&
    !list &&
    first !== undefined &&
    first.indent === inside
  ) {
    out.push(
      { indent, text: `- ${first.text}`, path: first.path },
      ...lines.slice(1),
    );
    return;
  }
  if (lead !== '') out.push({ indent, text: lead.trimEnd(), path });
  out.push(...lines);
};

const limitsOf = (options: PrintOptions | undefined): Limits => ({
  width: options?.width ?? WIDTH,
  depth: options?.depth ?? DEPTH,
});

export const printLines = (
  value: unknown,
  options?: PrintOptions,
): ReadonlyArray<PrintedLine> => {
  const out: Array<PrintedLine> = [];
  block(value, 0, 0, [], '', limitsOf(options), out);
  return out;
};

export const print = (value: unknown, options?: PrintOptions): string =>
  printLines(value, options)
    .map(({ indent, text }) => `${INDENT.repeat(indent)}${text}`)
    .join('\n');
