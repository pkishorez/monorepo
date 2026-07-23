export interface MarkdownContent {
  readonly kind: 'markdown';
  readonly content: string;
}

/** Authors Markdown without introducing MDX or executable components. */
export function markdown(
  strings: TemplateStringsArray,
  ...values: readonly (string | number)[]
): MarkdownContent {
  const content = strings.reduce(
    (result, part, index) => result + part + (values[index] ?? ''),
    '',
  );
  return { kind: 'markdown', content: dedent(content) };
}

function dedent(value: string): string {
  const lines = value.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join('\n');
}
