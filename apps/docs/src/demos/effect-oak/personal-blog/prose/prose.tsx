import { Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import { parse } from './parse.js';
import type { Block } from './parse.js';

/*
 * Prose: markdown-subset text drawn as React. The text is read into blocks
 * (`parse.ts`), and each block is drawn here; islands and containers are
 * drawn by the caller, so a post can hold something live from the app.
 */

/** How the caller draws `::Name{…}` islands and `:::Name` containers. */
type Islands = Readonly<
  Record<
    string,
    (
      attributes: Readonly<Record<string, string>>,
      inner: ReactNode,
    ) => ReactNode
  >
>;

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;

/** Inline code, bold, emphasis and links inside a run of text. */
const Inline = ({ text }: { readonly text: string }) => (
  <>
    {text.split(INLINE).map((part, index) => {
      if (!part) return null;
      if (part.startsWith('`') && part.endsWith('`'))
        return (
          <code key={index} className="rounded bg-muted px-1 text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        );
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
        return <em key={index}>{part.slice(1, -1)}</em>;
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link)
        return (
          <a
            key={index}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {link[1]}
          </a>
        );
      return <Fragment key={index}>{part}</Fragment>;
    })}
  </>
);

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

const BlockView = ({
  block,
  islands,
}: {
  readonly block: Block;
  readonly islands: Islands;
}): ReactNode => {
  switch (block._tag) {
    case 'Heading': {
      const Tag = HEADINGS[block.level - 1] ?? 'h6';
      return (
        <Tag className="mt-8 text-2xl font-semibold text-foreground">
          <Inline text={block.text} />
        </Tag>
      );
    }
    case 'Paragraph':
      return (
        <p className="leading-relaxed">
          <Inline text={block.text} />
        </p>
      );
    case 'List': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={`space-y-1 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'Code':
      return (
        <div className="overflow-hidden rounded-lg bg-zinc-900 text-zinc-100">
          {block.language && (
            <div className="border-b border-zinc-700 px-4 py-1.5 font-mono text-xs text-zinc-400">
              {block.language}
            </div>
          )}
          <pre className="overflow-x-auto p-4 font-mono text-sm">
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case 'Quote':
      return (
        <blockquote className="border-l-4 pl-4 italic">
          <Inline text={block.text} />
        </blockquote>
      );
    case 'Rule':
      return <hr />;
    case 'Island':
      return islands[block.name]?.(block.attributes, null) ?? null;
    case 'Container':
      return (
        islands[block.name]?.(
          {},
          <Blocks blocks={block.blocks} islands={islands} />,
        ) ?? null
      );
  }
};

const Blocks = ({
  blocks,
  islands,
}: {
  readonly blocks: ReadonlyArray<Block>;
  readonly islands: Islands;
}) => (
  <div className="flex flex-col gap-5">
    {blocks.map((block, index) => (
      <BlockView key={index} block={block} islands={islands} />
    ))}
  </div>
);

export const Prose = ({
  source,
  islands,
}: {
  readonly source: string;
  readonly islands: Islands;
}) => {
  const blocks = useMemo(() => parse(source), [source]);
  return (
    <div className="text-foreground/80">
      <Blocks blocks={blocks} islands={islands} />
    </div>
  );
};
