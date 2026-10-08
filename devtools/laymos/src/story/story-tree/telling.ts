/** What a `story.md` says, split the way a Story card shows it. */
export interface Telling {
  /** The first `#` heading; `null` when there is none. */
  readonly title: string | null;
  /** The first paragraph after the title; empty when there is none. */
  readonly pitch: string;
  /** Everything after the pitch, as written. */
  readonly body: string;
  /** Story and Proof ids the Telling links to, in the order they first appear. */
  readonly links: readonly string[];
}

export function parseTelling(markdown: string): Telling {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const titleAt = lines.findIndex((line) => /^#\s+\S/.test(line));
  const title =
    titleAt === -1
      ? null
      : lines[titleAt]!.replace(/^#\s+/, '')
          .replace(/\s+#*\s*$/, '')
          .trim();
  let at = titleAt + 1;
  while (at < lines.length && lines[at]!.trim() === '') at += 1;
  const pitchStart = at;
  while (at < lines.length && lines[at]!.trim() !== '') at += 1;
  const block = lines.slice(pitchStart, at);
  const isParagraph =
    block.length > 0 &&
    !/^(#|```|~~~|[-*+]\s|\d+\.\s|>|\|)/.test(block[0]!.trim());
  return {
    title,
    pitch: isParagraph ? block.map((line) => line.trim()).join(' ') : '',
    body: lines
      .slice(isParagraph ? at : pitchStart)
      .join('\n')
      .trim(),
    links: tellingLinks(markdown),
  };
}

/** A link target that is not a URL, an anchor, or a path names a Story or a Proof. */
export function isIdLink(target: string): boolean {
  return (
    target !== '' &&
    !/^[a-z][a-z0-9+.-]*:/i.test(target) &&
    !/^[#/.]/.test(target)
  );
}

function tellingLinks(markdown: string): readonly string[] {
  const prose = markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  const links: string[] = [];
  for (const match of prose.matchAll(
    /(!?)\[[^\]]*\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g,
  )) {
    const target = match[2]!.replace(/\/+$/, '');
    if (match[1] === '' && isIdLink(target) && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}
