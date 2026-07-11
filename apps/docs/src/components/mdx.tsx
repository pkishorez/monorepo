import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Button } from '@monorepo/frontend/components/ui/button';
import { StatusBadge } from './status-badge';
import { ESchemaPlayground } from './eschema-playground';
import { SyncStrategyVisualizer } from './sync-strategy-visualizer';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Button,
    StatusBadge,
    ESchemaPlayground,
    SyncStrategyVisualizer,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
