import type { MouseEvent, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@kstackz/web-platform/components/utils';

import type { TreeIndex } from '../story-scope';
import { resolveLink } from './telling-links';

const remarkPlugins = [remarkGfm];

/**
 * A Telling's body as markdown. Links to Stories and Proofs follow inside
 * the Stories canvas; a link naming neither is marked broken where it sits.
 */
export function Telling({
  markdown,
  index,
  onStory,
  onProof,
  className,
}: {
  readonly markdown: string;
  readonly index: TreeIndex;
  readonly onStory: (id: string) => void;
  readonly onProof: (id: string) => void;
  readonly className?: string;
}) {
  const components: Components = {
    a: ({ href, children }) => (
      <TellingLink
        href={href ?? ''}
        index={index}
        onStory={onStory}
        onProof={onProof}
      >
        {children}
      </TellingLink>
    ),
    pre: ({ children }) => (
      <pre className="overflow-x-auto rounded-md bg-muted/60 px-3 py-2 text-[12px] leading-relaxed text-foreground">
        {children}
      </pre>
    ),
  };
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none break-words text-[13.5px] leading-[1.65] text-foreground/90',
        // A phone reads at arm's length: larger body text.
        'max-sm:text-[15px] max-sm:leading-[1.55] max-sm:prose-headings:text-[15px]',
        'prose-p:my-2.5 prose-headings:mb-2 prose-headings:mt-5 prose-headings:text-[13.5px] prose-headings:font-semibold prose-headings:text-foreground',
        'prose-ul:my-2.5 prose-li:my-0.5 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function TellingLink({
  href,
  index,
  onStory,
  onProof,
  children,
}: {
  readonly href: string;
  readonly index: TreeIndex;
  readonly onStory: (id: string) => void;
  readonly onProof: (id: string) => void;
  readonly children: ReactNode;
}) {
  const link = resolveLink(href, index);
  const follow = (run: () => void) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    run();
  };

  switch (link.kind) {
    case 'external':
      return (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] hover:decoration-foreground"
        >
          {children}
        </a>
      );
    case 'story':
    case 'proof':
      return (
        <a
          href={`#${link.kind}=${link.id}`}
          title={link.id}
          data-space-ignore
          onClick={follow(() =>
            link.kind === 'story' ? onStory(link.id) : onProof(link.id),
          )}
          className={cn(
            'cursor-pointer rounded-[3px] font-medium text-foreground no-underline',
            'shadow-[inset_0_-1.5px_0_0_var(--color-sky-500)] transition-[background-color,box-shadow] duration-150',
            'hover:bg-sky-500/10 hover:shadow-[inset_0_-2px_0_0_var(--color-sky-500)]',
          )}
        >
          {children}
        </a>
      );
    case 'broken':
      return (
        <span
          title={`No Story or Proof has the id ${link.id}`}
          className="text-destructive"
        >
          <span className="underline decoration-destructive/50 decoration-wavy underline-offset-[3px]">
            {children}
          </span>{' '}
          <span className="whitespace-nowrap rounded-[4px] bg-destructive/10 px-1 py-px text-[11.5px] font-medium">
            no Story{' '}
            <code className="!bg-transparent !p-0 !text-[11.5px] text-destructive">
              {link.id}
            </code>
          </span>
        </span>
      );
  }
}
