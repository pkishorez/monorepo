import { Blog } from '@/components/blog';
import Page, { frontmatter } from './page.mdx';
import { createFileRoute } from '@tanstack/react-router';
import { CodeBlock } from './components/codeblock';

export const Route = createFileRoute('/blog/_slug/fiber-part-3/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <Blog
        frontMatter={frontmatter}
        Content={Page}
        components={{ CodeBlock }}
      />
    </div>
  );
}
