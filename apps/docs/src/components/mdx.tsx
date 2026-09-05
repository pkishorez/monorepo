import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Button } from 'kui-toolkit/components/ui/button';
import { SwimLane } from 'kui-toolkit/components/blocks/swim-lane';
import { StatusBadge } from './status-badge';
import { ESchemaPlayground } from './eschema-playground';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Button,
    StatusBadge,
    ESchemaPlayground,
    SwimLane,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
