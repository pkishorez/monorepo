import { cn } from '@monorepo/frontend/utils';
import type { FrontmatterType, MDXComponentType } from 'hack-for-types.mdx';
import { CodeHighlight } from '../code-block';
import { InlineCode } from '../code-block/highlight';
import { SvgImage } from '../svg-image';
import { Link } from '@tanstack/react-router';
import { Link as LinkIcon } from '@monorepo/frontend/lucide';
import { Button } from '@monorepo/frontend/components/ui/button';
import { ReactNode } from 'react';
import { Note } from './note';
import { Question } from './question';

export function Blog({
  className,
  Content,
  frontMatter,
  components,
}: {
  className?: string;
  Content: typeof MDXComponentType;
  frontMatter: typeof FrontmatterType;
  components?: Record<string, React.ComponentType<any>>;
}) {
  return (
    <div
      className={cn(
        'prose dark:prose-invert prose-gray px-4 mx-auto prose-pre:bg-inherit',
        'prose-headings:font-bold prose-h1:text-foreground/80 prose-h2:text-foreground/85 prose-h3:text-foreground/90',
        'pt-8 pb-30',
        className,
      )}
    >
      <h1>{frontMatter?.title}</h1>
      <Content
        components={{
          pre: (props: any) => {
            return <CodeHighlight code={props.children.props.children} />;
          },
          code: (props: any) => <InlineCode code={props.children} />,
          SvgImage,
          // TODO: Improve the FootNote component styling
          FootNote: ({ label }: { label: string; children?: ReactNode }) => (
            <span>{label}</span>
          ),
          Hr: () => <div className="mt-5 mb-10 border border-border" />,
          Link: ({
            to,
            children,
            noExternal,
          }: {
            to: string;
            children: ReactNode;
            noExternal?: boolean;
          }) => (
            <Link
              to={to}
              target={noExternal ? '_self' : '_blank'}
              rel="noreferrer"
            >
              <Button
                variant="link"
                className="p-0 py-0 h-auto inline-flex gap-1 items-center text-foreground/70 hover:text-foreground"
                tabIndex={-1}
              >
                <LinkIcon size={8} className="size-3" />
                {children}
              </Button>
            </Link>
          ),
          Note,
          Question,
          ...components,
        }}
      />
    </div>
  );
}
