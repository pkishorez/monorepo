/*
 * A tiny markdown subset, read into blocks: headings, paragraphs, lists,
 * fenced code, quotes, rules, and two directives. `::Name{key="value"}` on
 * its own line is an island; `:::Name` … `:::` wraps blocks in a container.
 * Anything else is a paragraph. Inline marks are read when drawn.
 */

export type Block =
  | { readonly _tag: 'Heading'; readonly level: number; readonly text: string }
  | { readonly _tag: 'Paragraph'; readonly text: string }
  | {
      readonly _tag: 'List';
      readonly ordered: boolean;
      readonly items: ReadonlyArray<string>;
    }
  | { readonly _tag: 'Code'; readonly language: string; readonly code: string }
  | { readonly _tag: 'Quote'; readonly text: string }
  | { readonly _tag: 'Rule' }
  | {
      readonly _tag: 'Island';
      readonly name: string;
      readonly attributes: Readonly<Record<string, string>>;
    }
  | {
      readonly _tag: 'Container';
      readonly name: string;
      readonly blocks: ReadonlyArray<Block>;
    };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+\.\s+(.*)$/;
const ISLAND = /^::(\w+)(?:\{(.*)\})?$/;
const CONTAINER = /^:::(\w+)$/;
const ATTRIBUTE = /(\w+)="([^"]*)"/g;

const attributesOf = (raw = '') =>
  Object.fromEntries(
    [...raw.matchAll(ATTRIBUTE)].map(([, key, value]) => [key, value]),
  );

export const parse = (source: string): ReadonlyArray<Block> => {
  const lines = source.trim().split('\n');
  const blocks: Array<Block> = [];
  let at = 0;
  /** Lines from here while `keep` holds. */
  const take = (keep: (line: string) => boolean) => {
    const taken: Array<string> = [];
    while (at < lines.length && keep(lines[at]!)) taken.push(lines[at++]!);
    return taken;
  };

  while (at < lines.length) {
    const line = lines[at]!;
    const heading = HEADING.exec(line);
    const island = ISLAND.exec(line);
    const container = CONTAINER.exec(line);
    if (line.trim() === '') {
      at++;
    } else if (heading) {
      at++;
      blocks.push({
        _tag: 'Heading',
        level: heading[1]!.length,
        text: heading[2]!,
      });
    } else if (line.startsWith('```')) {
      at++;
      const code = take((l) => !l.startsWith('```'));
      at++;
      blocks.push({
        _tag: 'Code',
        language: line.slice(3).trim(),
        code: code.join('\n'),
      });
    } else if (container) {
      at++;
      const inner = take((l) => l !== ':::');
      at++;
      blocks.push({
        _tag: 'Container',
        name: container[1]!,
        blocks: parse(inner.join('\n')),
      });
    } else if (island) {
      at++;
      blocks.push({
        _tag: 'Island',
        name: island[1]!,
        attributes: attributesOf(island[2]),
      });
    } else if (line.trim() === '---') {
      at++;
      blocks.push({ _tag: 'Rule' });
    } else if (line.startsWith('>')) {
      const quoted = take((l) => l.startsWith('>'));
      blocks.push({
        _tag: 'Quote',
        text: quoted.map((l) => l.replace(/^>\s?/, '')).join(' '),
      });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items = take((l) => pattern.test(l));
      blocks.push({
        _tag: 'List',
        ordered,
        items: items.map((l) => pattern.exec(l)![1]!),
      });
    } else {
      const text = take(
        (l) =>
          l.trim() !== '' &&
          !HEADING.test(l) &&
          !l.startsWith('```') &&
          !l.startsWith('::'),
      );
      blocks.push({ _tag: 'Paragraph', text: text.join(' ') });
    }
  }
  return blocks;
};
