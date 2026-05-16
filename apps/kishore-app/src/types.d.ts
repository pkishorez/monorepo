declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    OPENROUTER_API_KEY: string;
  }
}

// src/mdx.d.ts

declare module '*.mdx' {
  type Frontmatter = {
    title: string;
    summary: string;
    slug: string;
    [key: string]: any;
  };
  type MDXComponent = (props: Record<string, unknown>) => JSX.Element;

  let component: MDXComponent;
  export default component;

  // Frontmatter export as object
  export const frontmatter: Frontmatter;

  export const FrontmatterType: Frontmatter;
  export const MDXComponentType: MDXComponent;
}
