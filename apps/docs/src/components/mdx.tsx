import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Button } from '@monorepo/frontend/components/ui/button';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Button,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
