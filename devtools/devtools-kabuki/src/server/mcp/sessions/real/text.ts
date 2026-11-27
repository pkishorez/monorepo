import { print } from '../../../rpc/contract/index.ts';

const WIDTH = 78;
const BRIEF = 72;

export const indented = (text: string, depth: number) =>
  text
    .split('\n')
    .map((line) => `${'  '.repeat(depth)}${line}`)
    .join('\n');

export const block = (value: unknown, depth: number) =>
  indented(print(value, { width: WIDTH - depth * 2 }), depth);

export const field = (name: string, value: unknown, depth: number) =>
  block({ [name]: value }, depth);

export const inline = (value: unknown, width: number): string | undefined => {
  const text = print({ _: value }, { width: width + 3, depth: 4 });
  return text.includes('\n') ? undefined : text.slice(3);
};

const holder = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const folded = (value: unknown) =>
  Array.isArray(value)
    ? `[…${value.length}]`
    : holder(value)
      ? `{…${Object.keys(value).length}}`
      : '…';

export interface Brief {
  readonly text: string;
  readonly cut: boolean;
}

export const brief = (value: unknown, width = BRIEF): Brief => {
  const whole = inline(value, width);
  if (whole !== undefined && whole.length <= width)
    return { text: whole, cut: false };
  if (!holder(value))
    return { text: `${print(value).slice(0, width)}…`, cut: true };
  if (Array.isArray(value)) return { text: folded(value), cut: true };
  const parts: Array<string> = [];
  const entries = Object.entries(value);
  let used = 4;
  for (const [key, one] of entries) {
    const room = Math.min(40, width - used);
    const printed = print({ [key]: one }, { width: room, depth: 3 });
    const shown =
      printed.includes('\n') || printed.length > room
        ? `${key}: ${folded(one)}`
        : printed;
    if (used + shown.length > width) break;
    parts.push(shown);
    used += shown.length + 2;
  }
  const left = entries.length - parts.length;
  return {
    text: `{ ${[...parts, ...(left === 0 ? [] : [`… ${left} more`])].join(', ')} }`,
    cut: true,
  };
};

export const seconds = (at: number) => `${(at / 1000).toFixed(1)}s`;

export const firstLines = (failure: string) => {
  const lines = failure
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('at '));
  const text = lines.join(' ');
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

export const tagOf = (value: unknown) =>
  holder(value) && typeof (value as { _tag?: unknown })._tag === 'string'
    ? (value as { readonly _tag: string })._tag
    : undefined;

export const dataOf = (value: unknown) => {
  if (!holder(value) || Array.isArray(value)) return undefined;
  const { _tag, ...data } = value as Readonly<Record<string, unknown>>;
  return Object.keys(data).length === 0 ? undefined : data;
};

export const listed = (names: ReadonlyArray<string>, most = 4) =>
  names.length <= most
    ? names.join(', ')
    : `${names.slice(0, most).join(', ')} +${names.length - most}`;
